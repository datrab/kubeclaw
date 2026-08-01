// Task-scoped Kubernetes service access. The leased workload stays inside its
// namespace; dependent suites receive a loopback port that is closed by the
// suite runner's guaranteed runtime cleanup path.
import { spawn } from 'child_process';
import net from 'net';
function trimOutput(value, max = 500) {
    const text = value == null ? '' : String(value).trim();
    return text.length <= max ? text : `${text.slice(0, max)}…[${text.length - max} chars]`;
}
function allocateLocalPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close((error) => {
                if (error)
                    return reject(error);
                if (!address || typeof address === 'string')
                    return reject(new Error('could not allocate local port for kubectl port-forward'));
                resolve(address.port);
            });
        });
    });
}
export function buildLocalServiceHealthUrl(localPort, healthPath) {
    return `http://127.0.0.1:${localPort}${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;
}
function waitForPortForwardReady(child, outputState) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => finish(new Error(`kubectl port-forward did not become ready: ${trimOutput(outputState.value)}`)), 15000);
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeout);
            if (error)
                reject(error);
            else
                resolve();
        };
        const onData = (chunk) => {
            outputState.value += String(chunk);
            if (/Forwarding from/i.test(outputState.value))
                finish();
        };
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
        child.once('error', (error) => finish(error));
        child.once('exit', (code, signal) => {
            outputState.exited = true;
            finish(new Error(`kubectl port-forward exited before ready (code=${code ?? 'unknown'} signal=${signal ?? 'unknown'}): ${trimOutput(outputState.value)}`));
        });
    });
}
async function stopPortForward(child, outputState) {
    if (outputState.exited)
        return;
    await new Promise((resolve) => {
        let complete = false;
        const finish = () => {
            if (complete)
                return;
            complete = true;
            clearTimeout(forceTimer);
            resolve();
        };
        const forceTimer = setTimeout(() => {
            if (!outputState.exited)
                child.kill('SIGKILL');
            finish();
        }, 5000);
        child.once('exit', () => {
            outputState.exited = true;
            finish();
        });
        child.kill('SIGTERM');
    });
}
export async function startServicePortForward(ns, serviceName, servicePort, healthPath, log, env) {
    const localPort = await allocateLocalPort();
    const url = buildLocalServiceHealthUrl(localPort, healthPath);
    log(`Port-forwarding svc/${serviceName} ${localPort}:${servicePort} in ${ns}`);
    const child = spawn('kubectl', ['-n', ns, 'port-forward', `svc/${serviceName}`, `${localPort}:${servicePort}`, '--address', '127.0.0.1'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const outputState = { value: '', exited: false };
    try {
        await waitForPortForwardReady(child, outputState);
    }
    catch (error) {
        if (!outputState.exited)
            child.kill('SIGTERM');
        throw error;
    }
    return {
        localPort,
        url,
        stop: () => stopPortForward(child, outputState),
    };
}
export async function withServicePortForward(ns, serviceName, servicePort, healthPath, log, env, action) {
    const portForward = await startServicePortForward(ns, serviceName, servicePort, healthPath, log, env);
    try {
        return await action(portForward.url);
    }
    finally {
        await portForward.stop();
    }
}
