import { assertAdmissionReplay, readBoundedSnapshot } from "./replay-validation.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  canonicalJson,
  decodePipelineObservabilityContract,
  producerRecordDigest,
  validatePipelineObservabilityContract,
  type AdmissionAcknowledgementV1,
  type ProducerGapReportV1,
  type ProducerRecordV1,
  type UnresolvedObservabilityItemV1,
} from "@kubeclaw/pipeline-observability-contract";

interface OutboxEntry {
  record: ProducerRecordV1;
  bytes: string;
  acknowledged: boolean;
  canonicalCursor: number | null;
}
interface OutboxState {
  schemaVersion: "producer-outbox.v1";
  entries: OutboxEntry[];
}
interface AdmissionEntry {
  key: string;
  record: ProducerRecordV1;
  bytes: string;
  canonicalCursor: number;
  admittedAt: string;
}
export interface AdmittedRecordView {
  record: ProducerRecordV1;
  canonicalCursor: number;
  admittedAt: string;
}
interface QuarantineEntry {
  quarantineId: string;
  receivedAt: string;
  reason: string;
  rawBase64: string;
}
interface QuarantineOverflow {
  count: number;
  lastReceivedAt: string;
  lastReason: string;
  lastRawDigest: string;
  lastRawBytes: number;
}
export interface AdmissionState {
  schemaVersion: "observability-admission-store.v1";
  nextCursor: number;
  entries: AdmissionEntry[];
  quarantine: QuarantineEntry[];
  quarantineOverflow: QuarantineOverflow | null;
  gaps: ProducerGapReportV1[];
  unresolvedItems: Array<
    UnresolvedObservabilityItemV1 & { pipelineRunId: string }
  >;
  overflowUnresolvedItems: Array<
    UnresolvedObservabilityItemV1 & { pipelineRunId: string }
  >;
}
export interface ProducerOutboxLimits {
  maximumRecords: number;
  maximumBytes: number;
}
export interface AdmissionStoreLimits {
  maximumIngressBytes: number;
  maximumRecords: number;
  maximumBytes: number;
  maximumQuarantineRecords: number;
  maximumQuarantineBytes: number;
}
export interface AdmissionResult {
  acknowledgement: AdmissionAcknowledgementV1;
}
export interface AdmissionWithRecordsResult extends AdmissionResult {
  records: ReadonlyArray<AdmittedRecordView>;
}
export interface AdmissionTailSnapshot {
  records: ReadonlyArray<AdmittedRecordView>;
  nextCursor: number;
}

const EMPTY_OUTBOX: OutboxState = {
  schemaVersion: "producer-outbox.v1",
  entries: [],
};
const EMPTY_ADMISSION: AdmissionState = {
  schemaVersion: "observability-admission-store.v1",
  nextCursor: 1,
  entries: [],
  quarantine: [],
  quarantineOverflow: null,
  gaps: [],
  unresolvedItems: [],
  overflowUnresolvedItems: [],
};
const ADMISSION_METADATA_RESERVE = 1024;
async function readAdmissionState(file: string, limits: AdmissionStoreLimits): Promise<AdmissionState> {
  const state = await readDurableState(file, EMPTY_ADMISSION, limits.maximumBytes);
  assertAdmissionReplay(state, limits);
  return state;
}

export async function readDurableState<T>(
  file: string,
  fallback: T,
  maximumBytes?: number,
): Promise<T> {
  try {
    if (maximumBytes === undefined) return JSON.parse(await fs.readFile(file, "utf8")) as T;
    return JSON.parse(await readBoundedSnapshot(file, maximumBytes)) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return structuredClone(fallback);
    throw error;
  }
}
async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function ensureDirectoryDurable(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  const root = path.parse(resolved).root;
  const parts = path.relative(root, resolved).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink())
        throw new Error("OBSERVABILITY_STORE_PATH_SYMLINK");
      if (!stat.isDirectory())
        throw new Error("OBSERVABILITY_STORE_PATH_NOT_DIRECTORY");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await fs.mkdir(current);
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST")
          throw mkdirError;
      }
      const created = await fs.lstat(current);
      if (created.isSymbolicLink())
        throw new Error("OBSERVABILITY_STORE_PATH_SYMLINK");
      if (!created.isDirectory())
        throw new Error("OBSERVABILITY_STORE_PATH_NOT_DIRECTORY");
      await syncDirectory(path.dirname(current));
    }
  }
}
export async function writeDurableState(
  file: string,
  value: unknown,
): Promise<void> {
  await ensureDirectoryDurable(path.dirname(file));
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let renamed = false;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(canonicalJson(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
    renamed = true;
    await syncDirectory(path.dirname(file));
  } finally {
    if (!renamed) await fs.unlink(temporary).catch(() => undefined);
  }
}
async function acquireKernelLock(
  lockFile: string,
): Promise<() => Promise<void>> {
  const child = spawn(
    "/usr/bin/flock",
    [
      "--exclusive",
      "--timeout",
      "5",
      lockFile,
      "/bin/sh",
      "-c",
      "printf 'locked\\n'; exec /bin/cat >/dev/null",
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let error = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    error += chunk.toString("utf8");
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  await new Promise<void>((resolve, reject) => {
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes("locked\n")) resolve();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (!output.includes("locked\n"))
        reject(new Error(`OBSERVABILITY_STORE_LOCKED:${code}:${error.trim()}`));
    });
  });
  return async () => {
    child.stdin?.end();
    const code = await exited;
    if (code !== 0)
      throw new Error(
        `OBSERVABILITY_STORE_UNLOCK_FAILED:${code}:${error.trim()}`,
      );
  };
}
async function cleanupCrashArtifacts(
  directory: string,
  file: string,
): Promise<void> {
  const basename = path.basename(file);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      entry.name.startsWith(`${basename}.`) &&
      entry.name.endsWith(".tmp")
    )
      await fs.unlink(path.join(directory, entry.name)).catch(() => undefined);
  }
}
export async function withDurableStoreLock<T>(
  file: string,
  operation: () => Promise<T>,
): Promise<T> {
  const directory = path.dirname(file);
  await ensureDirectoryDurable(directory);
  const lockFile = path.join(directory, ".write-lock");
  const handle = await fs.open(lockFile, "a+", 0o600);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error("OBSERVABILITY_STORE_LOCK_FILE_INVALID");
  } finally {
    await handle.close();
  }
  let release: () => Promise<void>;
  try {
    release = await acquireKernelLock(lockFile);
  } catch (error) {
    throw new Error(
      `OBSERVABILITY_STORE_LOCK_FAILED:${file}:${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    await cleanupCrashArtifacts(directory, file);
    return await operation();
  } finally {
    await release();
  }
}
function keyOf(record: ProducerRecordV1): string {
  return [
    record.producer.producerId,
    record.producer.bootId,
    record.producer.producerType,
    record.correlation.pipelineRunId,
    String(record.sequence),
  ].join("|");
}
function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
function validIdentityPart(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}
function quarantineAttribution(
  raw: Uint8Array | string,
): AdmissionState["unresolvedItems"][number] | null {
  try {
    const bytes = Buffer.from(raw);
    const decoded = JSON.parse(bytes.toString("utf8")) as {
      producer?: Record<string, unknown>;
      correlation?: { pipelineRunId?: string };
      recordId?: string;
    };
    if (
      !decoded.producer ||
      !validIdentityPart(decoded.producer.producerId) ||
      !validIdentityPart(decoded.producer.bootId) ||
      !validIdentityPart(decoded.producer.producerType) ||
      !validIdentityPart(decoded.correlation?.pipelineRunId)
    )
      return null;
    const producer = {
      producerId: decoded.producer.producerId,
      bootId: decoded.producer.bootId,
      producerType: decoded.producer.producerType,
    };
    const rawDigest = createHash("sha256").update(bytes).digest("hex");
    return {
      itemId: `quarantine:${rawDigest}`,
      kind: "quarantined-record",
      producer,
      subjectId: validIdentityPart(decoded.recordId)
        ? decoded.recordId
        : `record:${rawDigest}`,
      reasonCode: "record-quarantined",
      pipelineRunId: decoded.correlation.pipelineRunId,
    };
  } catch {
    return null;
  }
}

export class FileProducerOutbox {
  readonly #file: string;
  readonly #limits: ProducerOutboxLimits;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(directory: string, limits: ProducerOutboxLimits) {
    if (!validLimit(limits.maximumRecords) || !validLimit(limits.maximumBytes))
      throw new Error("OBSERVABILITY_OUTBOX_LIMIT_INVALID");
    this.#file = path.join(directory, "outbox.json");
    this.#limits = limits;
  }
  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const locked = () => withDurableStoreLock(this.#file, operation);
    const result = this.#queue.then(locked, locked);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  async append(
    unsigned: Omit<ProducerRecordV1, "recordDigest"> | ProducerRecordV1,
  ): Promise<ProducerRecordV1> {
    const input = structuredClone(unsigned);
    const candidateRecord = {
      ...input,
      recordDigest: producerRecordDigest(input as ProducerRecordV1),
    } as ProducerRecordV1;
    const bytes = canonicalJson(candidateRecord);
    const record = decodePipelineObservabilityContract(
      "producerRecord",
      bytes,
    ) as ProducerRecordV1;
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_OUTBOX);
      const key = keyOf(record);
      const existing = state.entries.find(
        (entry) => keyOf(entry.record) === key,
      );
      if (existing) {
        if (existing.record.recordDigest !== record.recordDigest)
          throw new Error("OBSERVABILITY_OUTBOX_IDENTITY_CONFLICT");
        return structuredClone(existing.record);
      }
      const candidate = {
        ...state,
        entries: [
          ...state.entries,
          { record, bytes, acknowledged: false, canonicalCursor: null },
        ],
      };
      if (
        state.entries.length >= this.#limits.maximumRecords ||
        Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes
      )
        throw new Error("OBSERVABILITY_OUTBOX_FULL");
      await writeDurableState(this.#file, candidate);
      return structuredClone(record);
    });
  }
  async pending(): Promise<ReadonlyArray<OutboxEntry>> {
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_OUTBOX);
      return state.entries
        .filter((entry) => !entry.acknowledged)
        .sort((left, right) => left.record.sequence - right.record.sequence);
    });
  }
  async acknowledge(ack: AdmissionAcknowledgementV1): Promise<void> {
    validatePipelineObservabilityContract("admissionAcknowledgement", ack);
    const snapshot = JSON.parse(
      canonicalJson(ack),
    ) as AdmissionAcknowledgementV1;
    await this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_OUTBOX);
      const entry = state.entries.find(
        (candidate) =>
          candidate.record.recordId === snapshot.recordId &&
          keyOf(candidate.record) ===
            [
              snapshot.producer.producerId,
              snapshot.producer.bootId,
              snapshot.producer.producerType,
              snapshot.pipelineRunId,
              String(snapshot.sequence),
            ].join("|"),
      );
      if (
        !entry ||
        entry.record.recordDigest !== snapshot.recordDigest ||
        entry.record.producer.producerType !== snapshot.producer.producerType
      )
        throw new Error("OBSERVABILITY_ACK_MISMATCH");
      entry.acknowledged = true;
      entry.canonicalCursor = snapshot.canonicalCursor;
      await writeDurableState(this.#file, state);
    });
  }
  async compact(): Promise<number> {
    return this.#serial(async () => {
      const state = await readDurableState(this.#file, EMPTY_OUTBOX);
      const before = state.entries.length;
      state.entries = state.entries.filter((entry) => !entry.acknowledged);
      await writeDurableState(this.#file, state);
      return before - state.entries.length;
    });
  }
}

export class FileObservabilityAdmissionStore {
  readonly #file: string;
  readonly #limits: AdmissionStoreLimits;
  #queue: Promise<unknown> = Promise.resolve();
  constructor(directory: string, limits: AdmissionStoreLimits) {
    if (
      Object.values(limits).some((value) => !validLimit(value)) ||
      limits.maximumBytes <= ADMISSION_METADATA_RESERVE
    )
      throw new Error("OBSERVABILITY_ADMISSION_LIMIT_INVALID");
    this.#file = path.join(directory, "admission.json");
    this.#limits = limits;
  }
  storageDirectory(): string {
    return path.dirname(this.#file);
  }
  #serial<T>(operation: () => Promise<T>): Promise<T> {
    const locked = () => withDurableStoreLock(this.#file, operation);
    const result = this.#queue.then(locked, locked);
    this.#queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  #reason(reason: string): string {
    return reason.length <= 256
      ? reason
      : `${reason.slice(0, 180)}:sha256:${createHash("sha256").update(reason).digest("hex")}`;
  }
  async #recordOverflow(
    state: AdmissionState,
    raw: Uint8Array | string,
    reason: string,
    attributeToRun = true,
  ): Promise<void> {
    const attributed = attributeToRun ? quarantineAttribution(raw) : null;
    if (attributed) {
      const overflowItem = {
        ...attributed,
        itemId: `quarantine-overflow:${attributed.pipelineRunId}`,
        subjectId: `quarantine-overflow:${attributed.pipelineRunId}`,
        reasonCode: "quarantine-overflow",
      };
      const alreadyTracked = state.overflowUnresolvedItems.some(
        (item) => item.itemId === overflowItem.itemId,
      );
      if (
        !alreadyTracked &&
        state.overflowUnresolvedItems.length >=
          this.#limits.maximumQuarantineRecords
      )
        throw new Error("OBSERVABILITY_ADMISSION_FULL");
      if (!alreadyTracked) state.overflowUnresolvedItems.push(overflowItem);
    }
    state.quarantineOverflow = {
      count: (state.quarantineOverflow?.count ?? 0) + 1,
      lastReceivedAt: new Date().toISOString(),
      lastReason: this.#reason(reason),
      lastRawDigest: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
      lastRawBytes:
        typeof raw === "string" ? Buffer.byteLength(raw) : raw.byteLength,
    };
    if (Buffer.byteLength(canonicalJson(state)) > this.#limits.maximumBytes)
      throw new Error("OBSERVABILITY_ADMISSION_FULL");
    await writeDurableState(this.#file, state);
  }
  async #quarantine(
    state: AdmissionState,
    raw: Uint8Array,
    reason: string,
  ): Promise<void> {
    const boundedReason = this.#reason(reason);
    if (state.quarantine.length >= this.#limits.maximumQuarantineRecords) {
      await this.#recordOverflow(state, raw, boundedReason);
      return;
    }
    const encoded = Buffer.from(raw).toString("base64");
    const attributed = quarantineAttribution(raw);
    const candidate = {
      ...state,
      quarantine: [
        ...state.quarantine,
        {
          quarantineId: `quarantine:${randomUUID()}`,
          receivedAt: new Date().toISOString(),
          reason: boundedReason,
          rawBase64: encoded,
        },
      ],
      unresolvedItems:
        attributed &&
        !state.unresolvedItems.some((item) => item.itemId === attributed.itemId)
          ? [...state.unresolvedItems, attributed]
          : state.unresolvedItems,
    };
    if (
      Buffer.byteLength(canonicalJson(candidate.quarantine)) >
        this.#limits.maximumQuarantineBytes ||
      Buffer.byteLength(canonicalJson(candidate)) >
        this.#limits.maximumBytes - ADMISSION_METADATA_RESERVE
    ) {
      await this.#recordOverflow(state, raw, boundedReason);
      return;
    }
    await writeDurableState(this.#file, candidate);
  }
  async #rejectOversizedIngress(raw: Uint8Array | string): Promise<void> {
    const inputBytes =
      typeof raw === "string" ? Buffer.byteLength(raw) : raw.byteLength;
    if (inputBytes <= this.#limits.maximumIngressBytes) return;
    await this.#serial(async () => {
      const state = await readAdmissionState(this.#file, this.#limits);
      await this.#recordOverflow(
        state,
        raw,
        "OBSERVABILITY_INGRESS_TOO_LARGE",
        false,
      );
    });
    throw new Error("OBSERVABILITY_INGRESS_TOO_LARGE");
  }
  async #admitUnlocked(
    state: AdmissionState,
    bytes: Buffer,
  ): Promise<{
    acknowledgement: AdmissionAcknowledgementV1;
    state: AdmissionState;
  }> {
    let record: ProducerRecordV1;
    try {
      record = decodePipelineObservabilityContract(
        "producerRecord",
        bytes,
      ) as ProducerRecordV1;
    } catch (error) {
      await this.#quarantine(
        state,
        bytes,
        error instanceof Error ? error.message : "OBSERVABILITY_WIRE_INVALID",
      );
      throw error;
    }
    const key = keyOf(record);
    const existing = state.entries.find((entry) => entry.key === key);
    if (existing) {
      if (existing.record.recordDigest !== record.recordDigest) {
        await this.#quarantine(
          state,
          bytes,
          "OBSERVABILITY_ADMISSION_IDENTITY_CONFLICT",
        );
        throw new Error("OBSERVABILITY_ADMISSION_IDENTITY_CONFLICT");
      }
      return {
        acknowledgement: this.#ack(existing, "duplicate"),
        state,
      };
    }
    if (state.entries.length >= this.#limits.maximumRecords)
      throw new Error("OBSERVABILITY_ADMISSION_FULL");
    if (!Number.isSafeInteger(state.nextCursor) || state.nextCursor < 1)
      throw new Error("OBSERVABILITY_CURSOR_EXHAUSTED");
    const entry: AdmissionEntry = {
      key,
      record,
      bytes: bytes.toString("utf8"),
      canonicalCursor: state.nextCursor,
      admittedAt: new Date().toISOString(),
    };
    const candidate = {
      ...state,
      nextCursor: state.nextCursor + 1,
      entries: [...state.entries, entry],
    };
    if (
      Buffer.byteLength(canonicalJson(candidate)) >
      this.#limits.maximumBytes - ADMISSION_METADATA_RESERVE
    )
      throw new Error("OBSERVABILITY_ADMISSION_FULL");
    await writeDurableState(this.#file, candidate);
    return {
      acknowledgement: this.#ack(entry, "admitted"),
      state: candidate,
    };
  }
  #recordViews(state: AdmissionState): ReadonlyArray<AdmittedRecordView> {
    return state.entries.map((entry) => ({
      record: structuredClone(entry.record),
      canonicalCursor: entry.canonicalCursor,
      admittedAt: entry.admittedAt,
    }));
  }
  async admit(raw: Uint8Array | string): Promise<AdmissionResult> {
    await this.#rejectOversizedIngress(raw);
    return this.#serial(async () => {
      const bytes = Buffer.from(raw);
      const admitted = await this.#admitUnlocked(
        await readAdmissionState(this.#file, this.#limits),
        bytes,
      );
      return { acknowledgement: admitted.acknowledgement };
    });
  }
  async admitAndRead(
    raw: Uint8Array | string,
  ): Promise<AdmissionWithRecordsResult> {
    await this.#rejectOversizedIngress(raw);
    return this.#serial(async () => {
      const admitted = await this.#admitUnlocked(
        await readAdmissionState(this.#file, this.#limits),
        Buffer.from(raw),
      );
      return {
        acknowledgement: admitted.acknowledgement,
        records: this.#recordViews(admitted.state),
      };
    });
  }
  #ack(
    entry: AdmissionEntry,
    state: "admitted" | "duplicate",
  ): AdmissionAcknowledgementV1 {
    return {
      schemaVersion: "admission-acknowledgement.v1",
      recordId: entry.record.recordId,
      producer: entry.record.producer,
      pipelineRunId: entry.record.correlation.pipelineRunId,
      sequence: entry.record.sequence,
      state,
      admittedAt: entry.admittedAt,
      canonicalCursor: entry.canonicalCursor,
      recordDigest: entry.record.recordDigest,
    };
  }
  async snapshot(): Promise<Readonly<AdmissionState>> {
    return this.#serial(() => readAdmissionState(this.#file, this.#limits));
  }
  async admittedRecords(): Promise<ReadonlyArray<AdmittedRecordView>> {
    return this.#serial(async () => {
      return this.#recordViews(await readAdmissionState(this.#file, this.#limits));
    });
  }
  async admittedTail(
    pipelineRunId: string,
    fromCursor: number,
  ): Promise<ReadonlyArray<AdmittedRecordView>> {
    return (await this.admittedTailSnapshot(pipelineRunId, fromCursor)).records;
  }
  async admittedTailSnapshot(
    pipelineRunId: string,
    fromCursor: number,
  ): Promise<AdmissionTailSnapshot> {
    if (!Number.isSafeInteger(fromCursor) || fromCursor < 1)
      throw new Error("OBSERVABILITY_CURSOR_INVALID");
    return this.#serial(async () => {
      const state = await readAdmissionState(this.#file, this.#limits);
      const records = state.entries
        .filter(
          (entry) =>
            entry.canonicalCursor >= fromCursor &&
            entry.record.correlation.pipelineRunId === pipelineRunId,
        )
        .map((entry) => ({
          record: structuredClone(entry.record),
          canonicalCursor: entry.canonicalCursor,
          admittedAt: entry.admittedAt,
        }));
      return { records, nextCursor: state.nextCursor };
    });
  }
  async recordGap(gap: ProducerGapReportV1): Promise<void> {
    validatePipelineObservabilityContract("gapReport", gap);
    const snapshot = structuredClone(gap);
    await this.#serial(async () => {
      const state = await readAdmissionState(this.#file, this.#limits);
      const existing = state.gaps.find(
        (item) =>
          item.pipelineRunId === snapshot.pipelineRunId &&
          item.producer.producerId === snapshot.producer.producerId &&
          item.producer.bootId === snapshot.producer.bootId &&
          item.producer.producerType === snapshot.producer.producerType &&
          item.fromSequence === snapshot.fromSequence &&
          item.toSequence === snapshot.toSequence,
      );
      if (existing && canonicalJson(existing) === canonicalJson(snapshot))
        return;
      if (snapshot.state === "restored") {
        if (!existing || existing.state === "restored")
          throw new Error("OBSERVABILITY_GAP_RESTORATION_UNDECLARED");
        const expectedCount = snapshot.toSequence - snapshot.fromSequence + 1;
        const admitted = new Set(
          state.entries
            .filter(
              (entry) =>
                entry.record.correlation.pipelineRunId ===
                  snapshot.pipelineRunId &&
                entry.record.producer.producerId ===
                  snapshot.producer.producerId &&
                entry.record.producer.bootId === snapshot.producer.bootId &&
                entry.record.producer.producerType ===
                  snapshot.producer.producerType &&
                entry.record.sequence >= snapshot.fromSequence &&
                entry.record.sequence <= snapshot.toSequence,
            )
            .map((entry) => entry.record.sequence),
        );
        if (admitted.size !== expectedCount)
          throw new Error("OBSERVABILITY_GAP_RESTORATION_UNPROVED");
      }
      const gaps = state.gaps.filter((item) => item !== existing);
      const candidate = { ...state, gaps: [...gaps, snapshot] };
      if (
        Buffer.byteLength(canonicalJson(candidate)) > this.#limits.maximumBytes
      )
        throw new Error("OBSERVABILITY_ADMISSION_FULL");
      await writeDurableState(this.#file, candidate);
    });
  }
  async observabilityIssues(pipelineRunId: string): Promise<{
    missingRanges: ProducerGapReportV1[];
    unresolvedItems: UnresolvedObservabilityItemV1[];
  }> {
    return this.#serial(async () => {
      const state = await readAdmissionState(this.#file, this.#limits);
      return {
        missingRanges: state.gaps
          .filter(
            (item) =>
              item.pipelineRunId === pipelineRunId && item.state !== "restored",
          )
          .map((item) => structuredClone(item)),
        unresolvedItems: [
          ...state.unresolvedItems
            .filter((item) => item.pipelineRunId === pipelineRunId)
            .map(({ pipelineRunId: _pipelineRunId, ...item }) =>
              structuredClone(item),
            ),
          ...state.overflowUnresolvedItems
            .filter((item) => item.pipelineRunId === pipelineRunId)
            .map(({ pipelineRunId: _pipelineRunId, ...item }) =>
              structuredClone(item),
            ),
        ],
      };
    });
  }
}

export async function deliverPending(
  outbox: FileProducerOutbox,
  admission: FileObservabilityAdmissionStore,
): Promise<number> {
  let delivered = 0;
  for (const entry of await outbox.pending()) {
    const { acknowledgement } = await admission.admit(entry.bytes);
    await outbox.acknowledge(acknowledgement);
    delivered += 1;
  }
  return delivered;
}
