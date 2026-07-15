import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TAIL_LIMIT_BYTES = Number(process.env.REAL_E2E_DIAGNOSTIC_CAPTURE_LIMIT || 64 * 1024);
const DEFAULT_FATAL_LINE_LIMIT = Number(process.env.REAL_E2E_DIAGNOSTIC_FATAL_LINE_LIMIT || 20);
const DEFAULT_PARTIAL_LINE_LIMIT_BYTES = Number(process.env.REAL_E2E_DIAGNOSTIC_PARTIAL_LINE_LIMIT || 8 * 1024);
const DEFAULT_FATAL_LINE_TEXT_LIMIT_BYTES = Number(process.env.REAL_E2E_DIAGNOSTIC_FATAL_LINE_TEXT_LIMIT || 2 * 1024);
const FATAL_LINE_PATTERN = /\b(error|fatal|exception|failed|failure|timed out|timeout|uncaught|unhandled|denied|refused|enoent|eacces|assertion|panic)\b/i;

function byteLength(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function trimUtf8TailToBytes(value, limitBytes) {
  let text = String(value || '');
  if (limitBytes <= 0) return '';
  while (byteLength(text) > limitBytes) {
    const excess = byteLength(text) - limitBytes;
    text = text.slice(Math.min(text.length, Math.max(1, excess)));
  }
  return text;
}

function trimUtf8HeadToBytes(value, limitBytes) {
  let text = String(value || '');
  if (limitBytes <= 0) return '';
  while (byteLength(text) > limitBytes) {
    const excess = byteLength(text) - limitBytes;
    text = text.slice(0, Math.max(0, text.length - Math.max(1, excess)));
  }
  return text;
}

function streamCaptureOptions(options = {}) {
  return {
    tailLimitBytes: Number(options.tailLimitBytes ?? DEFAULT_TAIL_LIMIT_BYTES),
    fatalLineLimit: Number(options.fatalLineLimit ?? DEFAULT_FATAL_LINE_LIMIT),
    partialLineLimitBytes: Number(options.partialLineLimitBytes ?? DEFAULT_PARTIAL_LINE_LIMIT_BYTES),
    fatalLineTextLimitBytes: Number(options.fatalLineTextLimitBytes ?? DEFAULT_FATAL_LINE_TEXT_LIMIT_BYTES),
    fatalLinePattern: options.fatalLinePattern || FATAL_LINE_PATTERN,
  };
}

export function createStreamCapture(options = {}) {
  const resolved = streamCaptureOptions(options);
  return {
    tail: '',
    bytes: 0,
    truncated: false,
    tail_limit_bytes: resolved.tailLimitBytes,
    fatal_line_limit: resolved.fatalLineLimit,
    partial_line_limit_bytes: resolved.partialLineLimitBytes,
    fatal_line_text_limit_bytes: resolved.fatalLineTextLimitBytes,
    fatal_lines: [],
    partial_line: '',
    fatal_line_pattern: resolved.fatalLinePattern,
  };
}

function recordFatalLine(capture, line) {
  const raw = String(line || '').trim();
  if (!raw || capture.fatal_lines.length >= capture.fatal_line_limit) return;
  if (!capture.fatal_line_pattern.test(raw)) return;
  const text = trimUtf8HeadToBytes(raw, capture.fatal_line_text_limit_bytes);
  capture.fatal_lines.push(text);
}

function consumeFatalLines(capture, text) {
  const combined = `${capture.partial_line}${text}`;
  const lines = combined.split(/\r?\n/);
  capture.partial_line = trimUtf8TailToBytes(lines.pop() || '', capture.partial_line_limit_bytes);
  for (const line of lines) recordFatalLine(capture, line);
}

export function appendStreamCapture(capture, chunk) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
  capture.bytes += byteLength(text);
  capture.tail = trimUtf8TailToBytes(`${capture.tail}${text}`, capture.tail_limit_bytes);
  capture.truncated = capture.bytes > byteLength(capture.tail);
  consumeFatalLines(capture, text);
  return capture;
}

export function finalizeStreamCapture(capture) {
  recordFatalLine(capture, capture.partial_line);
  capture.partial_line = '';
  return capture;
}

export function streamCaptureSnapshot(capture) {
  finalizeStreamCapture(capture);
  return {
    tail: capture.tail,
    bytes: capture.bytes,
    truncated: capture.truncated,
    tail_limit_bytes: capture.tail_limit_bytes,
    fatal_line_limit: capture.fatal_line_limit,
    partial_line_limit_bytes: capture.partial_line_limit_bytes,
    fatal_line_text_limit_bytes: capture.fatal_line_text_limit_bytes,
    fatal_lines: [...capture.fatal_lines],
  };
}

export function createChildOutputCapture({
  label,
  tailLimitBytes,
  fatalLineLimit,
  partialLineLimitBytes,
  fatalLineTextLimitBytes,
  stdoutLogPath = null,
  stderrLogPath = null,
} = {}) {
  return {
    label,
    stdout_log_path: stdoutLogPath,
    stderr_log_path: stderrLogPath,
    stdout: createStreamCapture({
      tailLimitBytes,
      fatalLineLimit,
      partialLineLimitBytes,
      fatalLineTextLimitBytes,
    }),
    stderr: createStreamCapture({
      tailLimitBytes,
      fatalLineLimit,
      partialLineLimitBytes,
      fatalLineTextLimitBytes,
    }),
  };
}

export function captureChildOutput(child, {
  label,
  prefixOutput = true,
  mirrorOutput = true,
  stdoutLogPath = null,
  stderrLogPath = null,
  tailLimitBytes,
  fatalLineLimit,
  partialLineLimitBytes,
  fatalLineTextLimitBytes,
} = {}) {
  if (stdoutLogPath) {
    fs.mkdirSync(path.dirname(stdoutLogPath), { recursive: true });
    fs.writeFileSync(stdoutLogPath, '');
  }
  if (stderrLogPath) {
    fs.mkdirSync(path.dirname(stderrLogPath), { recursive: true });
    fs.writeFileSync(stderrLogPath, '');
  }
  const output = createChildOutputCapture({
    label,
    tailLimitBytes,
    fatalLineLimit,
    partialLineLimitBytes,
    fatalLineTextLimitBytes,
    stdoutLogPath,
    stderrLogPath,
  });
  child.stdout?.on('data', (chunk) => {
    appendStreamCapture(output.stdout, chunk);
    if (stdoutLogPath) fs.appendFileSync(stdoutLogPath, chunk);
    if (mirrorOutput) {
      process.stdout.write(prefixOutput && label ? `[${label}] ${chunk.toString()}` : chunk.toString());
    }
  });
  child.stderr?.on('data', (chunk) => {
    appendStreamCapture(output.stderr, chunk);
    if (stderrLogPath) fs.appendFileSync(stderrLogPath, chunk);
    if (mirrorOutput) {
      process.stderr.write(prefixOutput && label ? `[${label}] ${chunk.toString()}` : chunk.toString());
    }
  });
  return output;
}

export function childOutputDiagnostics(label, output) {
  return {
    label,
    stdout_log_path: output.stdout_log_path || null,
    stderr_log_path: output.stderr_log_path || null,
    stdout: streamCaptureSnapshot(output.stdout),
    stderr: streamCaptureSnapshot(output.stderr),
  };
}
