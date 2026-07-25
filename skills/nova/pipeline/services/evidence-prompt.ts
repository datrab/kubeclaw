import crypto from 'node:crypto';
import { publishArtifact } from '../portable-artifacts.ts';
import { evidenceConfig } from './evidence-utils.ts';

function promptSections(prompt: string) {
  return String(prompt)
    .split(/(?=^#{1,6}\s+)/m)
    .filter(Boolean)
    .map((content, index) => ({
      index,
      title: (
        content.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? `section-${index + 1}`
      ).trim(),
      source: index === 0 ? 'pipeline-composer' : 'composed-section',
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      byte_length: Buffer.byteLength(content),
    }));
}

export function publishPromptEvidence(config: any, input: any) {
  const {
    prompt,
    agent_type: agentType,
    work_id: workId,
    attempt,
    model = null,
    provider = null,
    thinking = null,
    template_version: templateVersion = 'pipeline-prompt.v1',
  } = input;
  const correlation = {
    project: config.project,
    run_id: config._runId ?? config.run_id,
    work_id: workId,
    work_type: 'module',
    attempt,
    source: 'pipeline',
    producer: 'nova/prompt-composer',
  };
  const artifact = publishArtifact(evidenceConfig(config), {
    logical_id: `prompt/${workId}/${agentType}/${attempt}`,
    kind: 'composed-prompt',
    media_type: 'text/markdown',
    bytes: prompt,
    producer: 'nova/prompt-composer',
    content_class: 'payload',
    completeness: 'full',
    correlation,
  });
  const metadata = {
    schema_version: 'composed_prompt.v1',
    artifact_id: artifact.artifact_id,
    reference: artifact.reference,
    template_version: templateVersion,
    sections: promptSections(prompt),
    model,
    provider,
    thinking,
    completeness: 'full',
    byte_length: artifact.byte_length,
    sha256: artifact.sha256,
    correlation,
  };
  const metadataArtifact = publishArtifact(evidenceConfig(config), {
    logical_id: `prompt-metadata/${workId}/${agentType}/${attempt}`,
    kind: 'prompt-metadata',
    media_type: 'application/json',
    bytes: JSON.stringify(metadata),
    producer: 'nova/prompt-composer',
    content_class: 'metadata',
    completeness: 'full',
    correlation,
  });
  return {
    ...metadata,
    metadata_reference: metadataArtifact.reference,
  };
}
