import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Exact owned producer omitted by the Kubernetes-only producer projection.
 * Parse the actual spawn/receiver/value/order, not a textual key occurrence.
 * This qualifies this one native launch boundary, not arbitrary object fields.
 */
export function nativeSupervisorEnvironmentProducer(root) {
  const file = 'skills/worker/core/worker/native-worker-ownership.ts';
  const base = fs.realpathSync(root), filename = path.join(base, file);
  if (!fs.lstatSync(filename).isFile() || !fs.realpathSync(filename).startsWith(base + path.sep)) {
    throw new Error('NATIVE_SUPERVISOR_PRODUCER_SOURCE_BOUNDARY');
  }
  const bytes = fs.readFileSync(filename);
  const source = {text: new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
  const ast = ts.createSourceFile(file, source.text, ts.ScriptTarget.Latest, true);
  if (ast.parseDiagnostics.length) throw new Error('NATIVE_SUPERVISOR_PRODUCER_SYNTAX');
  const matches = [];
  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name?.text === 'NativeWorkerOwnershipLease') {
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || member.name.getText(ast) !== '#spawn') continue;
        function find(call) {
          if (ts.isCallExpression(call) && call.expression.getText(ast) === 'this.#launchers.spawn') {
            const [launcher, arguments_, options] = call.arguments;
            if (launcher?.getText(ast) !== 'this.#launcher' || !arguments_ || !options
              || !ts.isObjectLiteralExpression(options)) throw new Error('NATIVE_SUPERVISOR_PRODUCER_TARGET_CHANGED');
            const envs = options.properties.filter(property => ts.isPropertyAssignment(property)
              && property.name.getText(ast) === 'env');
            if (envs.length !== 1 || !ts.isObjectLiteralExpression(envs[0].initializer)) {
              throw new Error('NATIVE_SUPERVISOR_PRODUCER_ENV_CHANGED');
            }
            const properties = envs[0].initializer.properties;
            if (properties.length !== 2 || !ts.isSpreadAssignment(properties[0])
              || properties[0].expression.getText(ast) !== 'command.environment'
              || !ts.isPropertyAssignment(properties[1])
              || properties[1].name.getText(ast) !== 'KUBECLAW_NATIVE_SUPERVISOR_PID'
              || properties[1].initializer.getText(ast) !== 'String(process.pid)') {
              throw new Error('NATIVE_SUPERVISOR_PRODUCER_PRECEDENCE_CHANGED');
            }
            matches.push({call, property: properties[1], method: member});
          }
          ts.forEachChild(call, find);
        }
        find(member.body);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (matches.length !== 1) throw new Error('NATIVE_SUPERVISOR_PRODUCER_CARDINALITY_CHANGED');
  const {call, property, method} = matches[0];
  const line = ast.getLineAndCharacterOfPosition(property.getStart(ast)).line + 1;
  return {name: 'KUBECLAW_NATIVE_SUPERVISOR_PID', path: file, line,
    access: 'owned-process-env', sourceSha256: source.sha256,
    owningSurface: 'NativeWorkerOwnershipLease.#spawn: this.#launchers.spawn(this.#launcher, …), env after command.environment',
    custody: {schemaVersion: 'owned-process-environment-custody.v1',
      sourceSha256: source.sha256, sourceRange: [method.getStart(ast), method.end],
      callRange: [call.getStart(ast), call.end], valueRange: [property.getStart(ast), property.end],
      expression: 'String(process.pid)', override: 'after command.environment',
      receiver: 'skills/worker/core/worker/native-worker-launcher.c'},
    contract: {
      purpose: 'Supplies the current trusted supervisor PID to its native launcher child. This owned producer overwrites an inherited command value; operators must not set the binding directly.',
      acceptedForm: 'String(process.pid), the decimal PID of the producing supervisor. The receiving C launcher separately checks conversion, INT_MAX, parent identity and parent-death-signal operations.',
      defaultBehavior: 'Every call to this owned spawn supplies the current process PID; it does not use a default from command.environment.',
      emptyBehavior: 'This producer does not supply an empty string. Separate receiver checks reject missing or empty input.',
      invalidBehavior: 'Producer assignment does not prove runtime acceptance; the C launcher validates its privileged caller and checks the parent twice.',
      precedence: 'The explicit property follows the command.environment spread and replaces the same inherited key.',
      impact: 'Binds this launcher child to the supervisor process that spawned it, rather than an operator-selected PID.',
      failure: 'The producer can be fenced before spawning. Spawn failures and stage-specific launcher failures remain separate; this assignment proves neither execution nor cleanup.',
      owningSurface: 'NativeWorkerOwnershipLease.#spawn owned process environment',
      owner: '@kubeclaw/worker-core', required: 'supplied by every owned native launcher spawn',
      boundary: 'checked-in owned process producer; receiving native launcher source is separately qualified',
      evidence: [{path: file, line: ast.getLineAndCharacterOfPosition(method.getStart(ast)).line + 1,
        endLine: ast.getLineAndCharacterOfPosition(method.end).line + 1}],
    }};
}
