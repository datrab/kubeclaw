/** Test-only API adapters. Actual parser/extractor/store/service; preparation UID,
 * native envelope identity and publication are modeled, never kernel evidence. */
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  repositoryArchiveBytes,
  type RemotePlanJobV1,
} from "@kubeclaw/pipeline-test-gate-contract";
import {
  PreparedBusterPlanJobStore,
  type BusterPlanJobStoreOptions,
} from "../../../skills/buster/engine/test-gates/prepared-plan-store.ts";
import {
  BusterRemotePlanService,
  type BusterRemotePlanServiceOptions,
} from "../../../skills/buster/engine/test-gates/remote-plan-service.ts";
import { readPreparationInput } from "../../../skills/buster/engine/test-gates/preparation-source.ts";
import { safeExtract } from "../../../skills/buster/engine/test-gates/preparation-archive.ts";
import {
  assertBusterInput,
  wireDigest,
  type BusterStagedAdmission,
  type StagedAdmission,
} from "../../../skills/buster/engine/test-gates/preparation-input.ts";
import {
  preparedPlanHeader,
  preparationDigest,
  assertPreparedSource,
  assertPreparedSourceShape,
  type PreparedPlanJob,
  type PreparedSourceReference,
} from "../../../skills/buster/engine/test-gates/preparation-header.ts";
import type {
  BusterPreparation,
  PreparedAdmission,
} from "../../../skills/buster/engine/test-gates/preparation-client.ts";
import {
  busterPreparationSettingsFromConfig,
  busterSettingsFromConfig,
  validateBusterPreparationSettings,
  type BusterPreparationSettings,
} from "../../../skills/common/plugin-runtime/foundation/config/swarm.ts";
export {
  preparedPlanStateRoot,
  preparedPlanRuntimeRoot,
} from "../../../skills/buster/engine/test-gates/prepared-plan-paths.ts";

const canonicalSettings = busterPreparationSettingsFromConfig(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../charts/kubeclaw/files/config/swarm.config.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
export type ModeledStoreOptions = BusterPlanJobStoreOptions & {
  maximumArchiveBytes: number;
};
function ingress(
  input: RemotePlanJobV1 | AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
  if (Symbol.asyncIterator in input) return input;
  const wire = Buffer.from(JSON.stringify(input)); // Snapshot synchronously at the test call boundary.
  return (async function* () {
    yield wire;
  })();
}

export class ModeledPreparation implements BusterPreparation {
  readonly #root: string;
  readonly #authority: {
    trustedSourceAuthority: string;
    sourceAttestationPublicKey: string;
  };
  #settings: BusterPreparationSettings;
  #tarExecutable = "/usr/bin/tar";
  constructor(root: string, options: ModeledStoreOptions) {
    this.#root = path.resolve(`${root}-modeled-preparation`);
    this.#authority = {
      trustedSourceAuthority: options.trustedSourceAuthority,
      sourceAttestationPublicKey: options.sourceAttestationPublicKey.toString(),
    };
    this.#settings = validateBusterPreparationSettings({
      ...canonicalSettings,
      maximumArchiveBytes: options.maximumArchiveBytes,
    });
  }
  configure(options: {
    tarExecutable: string;
    maximumExtractedBytes: number;
  }): void {
    this.#tarExecutable = options.tarExecutable;
    this.#settings = validateBusterPreparationSettings({
      ...this.#settings,
      maximumExtractedBytes: options.maximumExtractedBytes,
    });
  }
  async stage(
    chunks: AsyncIterable<Uint8Array>,
    admit: (job: PreparedPlanJob) => Promise<boolean>,
  ): Promise<StagedAdmission | null> {
    const { job, wire } = await readPreparationInput(
      chunks,
      this.#settings,
      this.#authority,
      new AbortController().signal,
    );
    const header = preparedPlanHeader(job);
    if (!(await admit(structuredClone(header)))) return null;
    const admissionId = randomBytes(16).toString("hex");
    const input: StagedAdmission["input"] = {
      schemaVersion: "buster-staged-input.v1",
      admissionId,
      preparationUid: 1003,
      jobId: header.jobId,
      requestDigest: header.requestDigest,
      headerDigest: preparationDigest(header),
      wireDigest: wireDigest(wire),
      wireBytes: wire.length,
      attemptSpecDigest: preparationDigest({ modeled: "stage", admissionId }),
    };
    assertBusterInput(input, header);
    await fs.mkdir(this.#root, { recursive: true });
    const file = path.join(this.#root, `${admissionId}.json`);
    await fs.writeFile(file, wire, { flag: "wx" });
    return { job: header, input };
  }
  async extract(staged: BusterStagedAdmission): Promise<PreparedAdmission> {
    assertBusterInput(staged.input, staged.job);
    if (staged.input.schemaVersion !== "buster-staged-input.v1")
      throw new Error("MODELED_HISTORICAL_IMPORT_NOT_IMPLEMENTED");
    const wire = await fs.readFile(
      path.join(this.#root, `${staged.input.admissionId}.json`),
    );
    if (
      wire.length !== staged.input.wireBytes ||
      wireDigest(wire) !== staged.input.wireDigest
    )
      throw new Error("MODELED_PREPARATION_WIRE_CHANGED");
    const { job } = await readPreparationInput(
      (async function* () {
        yield wire;
      })(),
      this.#settings,
      this.#authority,
      new AbortController().signal,
    );
    if (
      preparationDigest(preparedPlanHeader(job)) !== staged.input.headerDigest
    )
      throw new Error("MODELED_PREPARATION_HEADER_CHANGED");
    const directory = await fs.mkdtemp(path.join(this.#root, "extract-"));
    const archive = path.join(directory, "repository.tar.gz"),
      repository = path.join(directory, "repository");
    await fs.mkdir(repository);
    await fs.writeFile(archive, repositoryArchiveBytes(job.repositoryArchive));
    await safeExtract(
      this.#tarExecutable,
      archive,
      repository,
      this.#settings,
      new AbortController().signal,
    );
    const source: PreparedSourceReference = {
      schemaVersion: "buster-prepared-source.v1",
      admissionId: staged.input.admissionId,
      preparationUid: 1003,
      jobId: staged.job.jobId,
      requestDigest: staged.job.requestDigest,
      headerDigest: staged.input.headerDigest,
      archiveDigest: staged.job.repositoryArchive.contentDigest,
      archiveBytes: staged.job.repositoryArchive.sizeBytes,
      attemptSpecDigest: preparationDigest({
        modeled: "extraction",
        directory,
      }),
    };
    assertPreparedSource(source, staged.job);
    await fs.writeFile(
      path.join(
        this.#root,
        `${source.attemptSpecDigest.slice(7)}.repository.json`,
      ),
      JSON.stringify({ source, repository }),
    );
    return { job: staged.job, source };
  }
  async repository(source: PreparedSourceReference): Promise<string> {
    assertPreparedSourceShape(source);
    const stored = JSON.parse(
      await fs.readFile(
        path.join(
          this.#root,
          `${source.attemptSpecDigest.slice(7)}.repository.json`,
        ),
        "utf8",
      ),
    );
    if (preparationDigest(stored.source) !== preparationDigest(source))
      throw new Error("MODELED_PREPARATION_SOURCE_CHANGED");
    return fs.realpath(stored.repository);
  }
}

export class ModeledPreparedPlanJobStore extends PreparedBusterPlanJobStore {
  readonly modeledPreparation: ModeledPreparation;
  constructor(root: string, options: ModeledStoreOptions) {
    super(root, options);
    this.modeledPreparation = new ModeledPreparation(root, options);
  }
  override async transition(
    ...args: Parameters<PreparedBusterPlanJobStore["transition"]>
  ) {
    try {
      return await super.transition(...args);
    } catch (error) {
      console.error(
        JSON.stringify({
          fixture: "modeled-real-store-transition",
          jobId: args[0],
          expected: args[1],
          target: args[2],
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }
  override async accept(
    input: BusterStagedAdmission | RemotePlanJobV1,
    now: string,
  ) {
    if ("input" in input) return super.accept(input, now);
    const staged = await this.modeledPreparation.stage(
      ingress(input),
      async () => true,
    );
    if (!staged) throw new Error("MODELED_PREPARATION_DECLINED");
    return super.accept(staged, now);
  }
}
export class ModeledBusterRemotePlanService extends BusterRemotePlanService {
  constructor(
    options: Omit<BusterRemotePlanServiceOptions, "preparation" | "store" | "admission"> & {
      admission?: BusterRemotePlanServiceOptions["admission"];
      store: ModeledPreparedPlanJobStore;
      tarExecutable: string;
      maximumExtractedBytes: number;
    },
  ) {
    options.store.modeledPreparation.configure(options);
    super({ ...options, preparation: options.store.modeledPreparation,
      admission: options.admission ?? busterSettingsFromConfig(JSON.parse(readFileSync(
        new URL("../../../charts/kubeclaw/files/config/swarm.config.json", import.meta.url), "utf8"))).admission });
  }
  override submit(input: RemotePlanJobV1 | AsyncIterable<Uint8Array>) {
    return super.submit(ingress(input));
  }
}
