export function verificationVerboseEnabled(argv = process.argv.slice(2), env = process.env) {
  return argv.includes('--verbose') || env.VERIFICATION_VERBOSE === '1';
}

function stringifyConsoleArgs(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.stack || value.message;
    try { return JSON.stringify(value); }
    catch (_error) { return String(value); }
  }).join(' ');
}

export function installQuietRuntimeConsole({
  verbose = verificationVerboseEnabled(),
  label = 'verification',
} = {}) {
  if (verbose) {
    return {
      verbose: true,
      restore() {},
      flush() {},
    };
  }

  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const bufferedOutput = [];
  let restored = false;
  let handlingFailure = false;

  function restore() {
    if (restored) return;
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    restored = true;
  }

  function flush(prefix = `[${label}] buffered runtime log output:`) {
    if (bufferedOutput.length === 0) return;
    originalConsoleError(prefix);
    for (const line of bufferedOutput) originalConsoleError(line);
  }

  function handleFailure(error) {
    if (handlingFailure) return;
    handlingFailure = true;
    restore();
    originalConsoleError(`[${label}] FAILED`);
    flush();
    originalConsoleError(error?.stack || String(error));
    process.exit(1);
  }

  const captureWrite = (chunk, encoding, callback) => {
    bufferedOutput.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
    if (typeof encoding === 'function') encoding();
    if (typeof callback === 'function') callback();
    return true;
  };

  console.log = (...values) => {
    bufferedOutput.push(stringifyConsoleArgs(values));
  };
  console.info = (...values) => {
    bufferedOutput.push(stringifyConsoleArgs(values));
  };
  console.warn = (...values) => {
    bufferedOutput.push(stringifyConsoleArgs(values));
  };
  console.error = (...values) => {
    bufferedOutput.push(stringifyConsoleArgs(values));
  };
  process.stdout.write = captureWrite;
  process.stderr.write = captureWrite;

  process.once('uncaughtException', handleFailure);
  process.once('unhandledRejection', handleFailure);

  return {
    verbose: false,
    restore,
    flush,
  };
}
