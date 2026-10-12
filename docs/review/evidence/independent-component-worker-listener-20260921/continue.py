"""Prepared only. Refuses execution until the final plan and freeze exist."""
import argparse
import json
import os
import pathlib
import re
import shutil
import subprocess
import time
from bind import capture, describe, digest, write_json

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = pathlib.Path.cwd()
harness = pathlib.Path(__file__).resolve().parent
plan = json.loads((harness / 'plan.json').read_text())
if not plan['ready'] or any(plan[key] is None for key in ['lintFiles', 'expectedCases', 'frozenAuthorManifest', 'negativeControlCommands']):
    raise SystemExit('REVIEW_NOT_FROZEN: preparation is not authorization or a completed case matrix')
output = pathlib.Path(args.output).resolve()
output.mkdir(parents=True, exist_ok=False)
(output / 'loads').mkdir()
freeze = json.loads((root / plan['frozenAuthorManifest']).read_text())
for row in freeze:
    if digest(root / row['path']) != row['sha256']:
        raise SystemExit(f'REVIEW_AUTHOR_FREEZE_MISMATCH:{row["path"]}')

tools = {}
for name in plan['requiredTools']:
    tool = shutil.which(name)
    if tool is None:
        raise SystemExit(f'REVIEW_TOOL_MISSING:{name}')
    tools[name] = str(pathlib.Path(tool).resolve(strict=True))
write_json(output / 'tools.json', {name: {'path': file, 'identity': describe(pathlib.Path(file))} for name, file in tools.items()})
# Bind the actual dynamic libraries selected for the executable toolchain as
# well as the whole explicitly selected GNU tool root. Static tools retain
# their binary identity and the loader diagnostic without inventing libraries.
native = root / plan['toolRoot']
loader_environment = dict(os.environ, LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib')
executables = list(tools.values()) + [str(native / file) for file in ['usr/bin/proot', 'usr/bin/flock', 'bin/tar']]
libraries = set()
loader_observations = []
for executable in executables:
    probe = subprocess.run(['ldd', executable], env=loader_environment, capture_output=True, text=True)
    text = probe.stdout + probe.stderr
    loader_observations.append({'executable': executable, 'exitCode': probe.returncode, 'output': text})
    for candidate in re.findall(r'/[^\s()]+', text):
        candidate_path = pathlib.Path(candidate)
        if candidate_path.is_file():
            libraries.add(candidate_path.resolve(strict=True))
write_json(output / 'tool-library-observations.json', loader_observations)

extra = list(harness.glob('*'))
extra = [file for file in extra if file.is_file()] + [pathlib.Path(file) for file in tools.values()] + list(libraries)
before = capture(root, plan, extra)
write_json(output / 'before.json', before)
previous = json.loads((harness / 'run2/after.json').read_text())
# New reviewer harness documents are additive evidence. Only this approved
# original fixture migration may change the previously bound source closure.
changes = [file for file in previous if not str(pathlib.Path(file)).startswith(str(harness)) and previous[file] != before.get(file)]
allowed = str(root / 'tests/verification/deployment/release-images.test.mjs')
write_json(output / 'prior-source-delta.json', changes)
if changes != [allowed]:
    raise SystemExit('UNREVIEWED_SOURCE_DELTA:' + repr(changes))

with (output / 'source.patch').open('w') as stream:
    subprocess.run(['git', 'diff', '--binary', '--', *plan['sourceRoots'], *plan['rootFiles']], stdout=stream, check=True)
tracked = set(subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0'))
for file in before:
    source = pathlib.Path(file)
    try:
        relative = source.relative_to(root)
    except ValueError:
        continue
    if str(relative) in tracked or relative.parts[0] not in plan['sourceRoots'] or source.is_symlink():
        continue
    target = output / 'new-source' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)

protected = set()
for chart in ['prism', 'kubeclaw']:
    protected.update((root / 'charts' / chart / 'files/config' / name).resolve(strict=True) for name in [
        'swarm.config.json', 'swarm.schema.json', 'swarm-components.schema.json',
        'prism-control.config.json', 'prism-studio.config.json', 'prism-worker.config.json',
        'prism-execution.config.json', 'buster-engine.config.json'])
protected.update((root / file).resolve(strict=True) for file in [
    'charts/prism/templates/_swarm-bundle.tpl', 'charts/prism/templates/_swarm-config.tpl',
    'charts/prism/templates/workloads.yaml', 'charts/kubeclaw/templates/_swarm-config.tpl',
    'charts/kubeclaw/templates/deployment.yaml'])
write_json(output / 'protected.json', [{'path': str(file), 'dev': str(file.stat().st_dev), 'ino': str(file.stat().st_ino)} for file in sorted(protected)])

native = root / plan['toolRoot']
node = tools['node']
base = [str(native / 'usr/bin/proot'), '-b', f'{native}/usr/bin/flock:/usr/bin/flock!',
        '-b', f'{native}/bin/tar:/usr/bin/tar!', node]
environment = dict(os.environ,
    LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',
    COMPONENT_REVIEW_PROTECTED_SOURCES=str(output / 'protected.json'),
    COMPONENT_REVIEW_WRITE_VIOLATIONS=str(output / 'source-write-violations.jsonl'),
    COMPONENT_REVIEW_TRACE_DIRECTORY=str(output / 'loads'))
if environment.get('NODE_OPTIONS'):
    raise SystemExit('REVIEW_EXISTING_NODE_OPTIONS_REQUIRES_EXPLICIT_REVIEW')
environment['NODE_OPTIONS'] = f'--import={harness / "source-write-guard.mjs"} --import={harness / "runtime-trace.mjs"}'

plan['releaseImagesCorrection'] = ['tests/verification/deployment/release-images.test.mjs']
commands = []
seen = set()
for group in ['releaseImagesCorrection', 'listenerAdditionalModules']:
    modules = [file for file in plan[group] if file not in seen]
    seen.update(modules)
    if modules:
        commands.append((group, base + ['--test', '--test-reporter=tap', '--test-concurrency=1', *modules], 0))
commands.extend((f'types-{index}', [node, 'node_modules/typescript/bin/tsc', '--noEmit', '-p', project], 0)
                for index, project in enumerate(plan['typeProjects']))
commands.extend((f'script-{index}', base + [module], 0) for index, module in enumerate(plan['scriptModules']))
plan['lintFiles'].append('tests/verification/deployment/release-images.test.mjs')
commands.append(('canonical-lint', [node, 'node_modules/eslint/bin/eslint.js', '--config', 'charts/kubeclaw/files/config/eslint.config.mjs', *plan['lintFiles']], 0))
commands.extend((item['name'], item['command'], item['expectedExit']) for item in plan['negativeControlCommands'])
results = []
try:
    for name, command, expected in commands:
        started = time.monotonic()
        with (output / f'{name}.txt').open('x') as stream:
            result = subprocess.run(command, env=environment, stdout=stream, stderr=subprocess.STDOUT)
        results.append({'name': name, 'command': command, 'exitCode': result.returncode,
                        'expectedExit': expected, 'seconds': time.monotonic() - started})
        write_json(output / 'results.json', results)
        print(name, result.returncode, flush=True)
        if (output / 'source-write-violations.jsonl').exists():
            raise RuntimeError('REVIEW_FIXTURE_SOURCE_WRITE_ATTEMPT: retained even if an assertion caught the exception')
        if result.returncode != expected:
            raise RuntimeError(f'REVIEW_COMMAND_FAILED:{name}')
finally:
    after = capture(root, plan, extra)
    write_json(output / 'after.json', after)
    changed = [file for file in before.keys() | after.keys() if before.get(file) != after.get(file)]
    write_json(output / 'drift.json', changed)
# A zero wrapper status is not acceptance: raw expected-case and mutation-oracle
# comparison, loaded-dependency closure verification, and independent DOC review
# remain required and are recorded explicitly by the reviewer.
if changed:
    raise SystemExit('REVIEW_SOURCE_DRIFT')
