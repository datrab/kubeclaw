from pathlib import Path
base=Path('skills/buster/engine/test-gates');p=base/'production.ts';s=p.read_text()
# Preserve exact original object expressions, split by provider responsibility.
names=['directCommand','containerBuild','kubernetesFixture','tailscaleExposure','networkHttp','browserAxe','browserLighthouse','browserVisual','browserPlaywright','securityScan','kubernetesRuntimeSecurity']
blocks={}
for i,name in enumerate(names):
 start=s.index('    ...('+name+'Source ? { '+name+': {')
 end=s.index('    ...('+names[i+1]+'Source ? {',start) if i+1<len(names) else s.index('\n  });\n  const tlsSource',start)
 blocks[name]=s[start:end].strip().removeprefix('...(').removesuffix(',').removesuffix(')')
helpers=s[s.index('function object'):s.index('export function loadProduction')]
helpers=helpers.replace('function ', 'export function ')
(base/'production-config-values.ts').write_text("import fs from 'node:fs';\nimport path from 'node:path';\nimport { validateRegistryHealth } from './registry-health-access.ts';\n\n"+helpers)
params={
'directCommand':'directCommandSource: Source, directory: string, directCommandCgroup: string | undefined, allowSampledProcessLimit: boolean',
'containerBuild':'containerBuildSource: Source, directory: string, registryUsername: string | undefined, registryPassword: string | undefined',
'networkHttp':'networkHttpSource: Source, containerBuildSource: Source, registryUsername: string | undefined, registryPassword: string | undefined',
'browserPlaywright':'browserPlaywrightSource: Source, directory: string, browserPlaywrightCgroup: string | undefined',
'securityScan':'securityScanSource: Source, directory: string, environment: NodeJS.ProcessEnv'}
groups={'production-command-options':['directCommand','containerBuild','networkHttp','securityScan'],'production-browser-options':['browserAxe','browserLighthouse','browserVisual','browserPlaywright'],'production-cluster-options':['kubernetesFixture','tailscaleExposure','kubernetesRuntimeSecurity']}
allhelpers=['object','integer','boolean','stringMap','stringArray','optionalStringArray','browserExecutableMap','integerArray','optionalEnvironmentSecret','registryHealthConfiguration','scannerRegistry','optionalDatabasePolicy']
imports=[]
for module,ns in groups.items():
 body=''
 for n in ns:
  args=params.get(n,n+'Source: Source'+(', directory: string' if 'path.resolve' in blocks[n] else ''))
  body+=f"export function {n}Options({args}): Pick<BusterCapabilityRuntimeOptions, '{n}'> {{\n  return {blocks[n]};\n}}\n\n"
 used=[h for h in allhelpers if h+'(' in body]
 header="import type { BusterCapabilityRuntimeOptions } from './capability-runtime.ts';\n"+("import path from 'node:path';\n" if 'path.resolve' in body else '')+"import { "+', '.join(used)+" } from './production-config-values.ts';\ntype Source = Record<string, unknown> | null;\n\n"
 (base/(module+'.ts')).write_text(header+body)
 imports.append("import { "+', '.join(n+'Options' for n in ns)+" } from './"+module+".ts';")
# sources: same original validation order.
a=s.index('  const directCommandSource');z=s.index('  const stateRoot',a)
sourcebody=s[a:z];returnnames=[n+'Source' for n in names]+['directCommandCgroup','allowSampledProcessLimit','registryUsername','registryPassword','browserPlaywrightCgroup']
# extract browser source guards into one coherent function to keep main source reader small
ba=sourcebody.index('  const browserAxeSource');bz=sourcebody.index('  const securityScanSource')
browser=sourcebody[ba:bz];browsernames=[n+'Source' for n in names if n.startswith('browser')]+['browserPlaywrightCgroup']
sourcebody=sourcebody[:ba]+'  const { '+', '.join(browsernames)+' } = browserSources(value, allowedCapabilities);\n'+sourcebody[bz:]
body='''import { object, optionalEnvironmentSecret } from './production-config-values.ts';
type Config = Record<string, unknown>;

function browserSources(value: Config, allowedCapabilities: ReadonlySet<string>) {
'''+browser+'  return { '+', '.join(browsernames)+' };\n}\n\nexport function capabilitySources(value: Config, allowedCapabilities: ReadonlySet<string>, environment: NodeJS.ProcessEnv) {\n'+sourcebody+'  return { '+', '.join(returnnames)+' };\n}\n'
(base/'production-capability-sources.ts').write_text(body)
# Main replace fields with explicit options.
a=s.index('    ...(directCommandSource ?');z=s.index('\n  });\n  const tlsSource',a)
calls=[]
for n in names:
 args=params.get(n,n+'Source: Source'+(', directory: string' if 'path.resolve' in blocks[n] else ''))
 calls.append('    ...'+n+'Options('+', '.join(a.split(':')[0].strip() for a in args.split(','))+'),')
s=s[:a]+'\n'.join(calls)+s[z:]
a=s.index('  const directCommandSource');z=s.index('  const stateRoot',a)
s=s[:a]+'  const { '+', '.join(returnnames)+' } = capabilitySources(value, allowedCapabilities, environment);\n'+s[z:]
a=s.index('function object');z=s.index('export function loadProduction',a);s=s[:a]+s[z:]
s=s.replace("import { validateRegistryHealth } from './registry-health-access.ts';\n",'')
s=s.replace('environment: Readonly<Record<string, string | undefined>> = process.env','environment: Readonly<Record<string, string | undefined>>')
s='\n'.join(imports)+"\nimport { object, integer, stringArray } from './production-config-values.ts';\nimport { capabilitySources } from './production-capability-sources.ts';\n"+s
p.write_text(s)
