export type AnyTaskRecord = Record<string, any>;
export type RedisTaskClient = AnyTaskRecord;
export type BusterTaskPayload = AnyTaskRecord & {
  completion_stream?: string;
  output_file?: string;
  project?: string;
  module_id?: string;
  module?: string;
  gate_id?: string;
  task_type?: string;
};
export type DeadLetterOptions = AnyTaskRecord & { streamKey: string; payload?: BusterTaskPayload };

export type BusterTaskIdentity = {
  taskType: 'module_test' | 'gate_test';
  moduleId: string;
  gateId: string | null;
  project: string;
  runId: string;
  attempt: number;
  dispatchId: string;
  completionStream: string;
  commitHash: string;
  stageId: string;
  workerType: string | null;
  timeoutSeconds: number;
  suites: string[];
  capabilities: string[];
  suiteTimeoutMs: number;
};

export type TaskIdentityCandidate = {
  taskType: string | null;
  moduleId: string | null;
  gateId: string | null;
  project: string | null;
  runId: string | null;
  attempt: number | null;
  dispatchId: string | null;
  completionStream: string | null;
  commitHash: string | null;
  outputFile: string | null;
  stageId: string | null;
  workerType: string | null;
  timeoutSeconds: number | null;
  sessionRuntime: string | undefined;
  sessionModel: string | null;
  sessionAgentId: string | null;
  sessionCwd: string | null;
  sessionLabel: string | null;
  suites: string[] | null;
  capabilities: string[];
  testConfigProvided: boolean;
  testConfig: AnyTaskRecord | null;
  suiteTimeoutMs: number | null;
};
