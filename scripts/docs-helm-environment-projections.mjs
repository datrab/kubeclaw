// Finite documentation-purpose recipes for three reviewed helper definitions.
// These are selected directive/declaration grammars, not full-file hashes or a
// Helm evaluator. Optional guards remain symbolic; all producing branches are
// acquired. Names are read from the checked syntax, never invented by receipts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import YAML from 'yaml';

const RECIPES = {
  "kubeclaw.demoReadyClientValidate": {
    "path": "charts/kubeclaw/templates/_demo-ready-client.tpl",
    "actions": [
      "if .Values.busterNamespaceBroker.readyClient.enabled",
      "if or (ne .Values.agentRole \"nova\") (not .Values.serviceAccount.create)",
      "fail \"Ready client requires the actual Nova release ServiceAccount\"",
      "end",
      "if not (hasPrefix \"https://\" .Values.busterNamespaceBroker.readyClient.endpoint)",
      "fail \"Ready client requires an explicit HTTPS controller endpoint\"",
      "end",
      "end"
    ],
    "literalLines": []
  },
  "kubeclaw.demoReadyClientEnv": {
    "path": "charts/kubeclaw/templates/_demo-ready-client.tpl",
    "actions": [
      "include \"kubeclaw.demoReadyClientValidate\" .",
      "if .Values.busterNamespaceBroker.readyClient.enabled",
      ".Values.busterNamespaceBroker.readyClient.endpoint | quote",
      "required \"Ready client audience is required\" .Values.busterNamespaceBroker.readyClient.audience | quote",
      "end"
    ],
    "literalLines": [
      "- name: KUBECLAW_DEMO_READY_ENDPOINT",
      "value:",
      "- name: KUBECLAW_DEMO_READY_AUDIENCE",
      "value:",
      "- name: KUBECLAW_DEMO_READY_TOKEN_PATH",
      "value: /var/run/kubeclaw/demo-ready/token",
      "- name: KUBECLAW_DEMO_READY_CA_PATH",
      "value: /var/run/kubeclaw/demo-ready-ca/ca.crt"
    ]
  },
  "prism.productDecisions.validate": {
    "path": "charts/prism/templates/_product-decisions.tpl",
    "actions": [
      "$config := .Values.control.productDecisions",
      "if $config.enabled",
      "if not .Values.tailscale.enabled",
      "fail \"Product decisions require the authenticated Tailscale Studio ingress\"",
      "end",
      "if eq $config.signingSecretName .Values.secrets.runtime",
      "fail \"Product decision signing authority must use a separate Secret\"",
      "end",
      "range $name := list \"issuer\" \"origin\" \"authorityRevision\" \"signingSecretName\" \"signingSecretKey\" \"controllerUrl\" \"controllerNamespace\" \"controllerRelease\" \"controllerCaSecretName\" \"controllerCaSecretKey\" \"tokenAudience\"",
      "if not (index $config $name)",
      "fail (printf \"Product decisions require %s\" $name)",
      "end",
      "end",
      "if not $config.operators",
      "fail \"Product decisions require an explicit operator allowlist\"",
      "end",
      "range $actor := $config.operators",
      "if or (eq $actor \"\") (ne $actor (trim $actor))",
      "fail \"Product operator identities must be nonempty and have no surrounding whitespace\"",
      "end",
      "end",
      "end"
    ],
    "literalLines": []
  },
  "prism.productDecisions.env": {
    "path": "charts/prism/templates/_product-decisions.tpl",
    "actions": [
      "$config := .Values.control.productDecisions",
      "if $config.enabled",
      "$config.issuer | quote",
      "toJson $config.operators | quote",
      "$config.origin | quote",
      "$config.controllerUrl | quote",
      "end"
    ],
    "literalLines": [
      "- { name: PRISM_PRODUCT_DECISIONS_ENABLED, value: \"true\" }",
      "- { name: PRISM_PRODUCT_ISSUER, value:                              }",
      "- { name: PRISM_PRODUCT_OPERATORS, value:                                        }",
      "- { name: PRISM_PRODUCT_ORIGIN, value:                              }",
      "- { name: PRISM_PRODUCT_PRIVATE_KEY_FILE, value: /var/run/prism/product-signing/private-key.pem }",
      "- { name: PRISM_PRODUCT_CONTROLLER_URL, value:                                     }",
      "- { name: PRISM_PRODUCT_CONTROLLER_CA_FILE, value: /var/run/prism/product-controller/ca.crt }",
      "- { name: PRISM_PRODUCT_CONTROLLER_TOKEN_FILE, value: /var/run/prism/product-controller/token }"
    ]
  },
  "kubeclaw.registryContainer": {
    "path": "charts/kubeclaw/templates/_registry-clients.tpl",
    "actions": [
      "$root := .root",
      "$container := deepCopy .container",
      "$settings := $root.Values.runtimeInfrastructure",
      "range $key, $_ := $settings",
      "if not (has $key (list \"registry\" \"dockerHubMirror\" \"localRegistry\"))",
      "fail (printf \"unknown runtimeInfrastructure field %s\" $key)",
      "end",
      "end",
      "range $name, $client := dict \"registry\" $settings.registry \"dockerHubMirror\" $settings.dockerHubMirror",
      "$allowed := list \"endpoint\" \"transport\" \"caSecretName\" \"caSecretKey\" \"nodeCaFile\"",
      "if eq $name \"registry\"",
      "$allowed = concat $allowed (list \"authSecretName\" \"usernameKey\" \"passwordKey\")",
      "end",
      "range $key, $_ := $client",
      "if not (has $key $allowed)",
      "fail (printf \"unknown runtimeInfrastructure.%s field %s\" $name $key)",
      "end",
      "end",
      "end",
      "if and (empty $settings.dockerHubMirror.endpoint) (or $settings.dockerHubMirror.transport $settings.dockerHubMirror.caSecretName $settings.dockerHubMirror.nodeCaFile)",
      "fail \"disabled Docker Hub mirror requires empty endpoint, transport and trust\"",
      "end",
      "if $settings.localRegistry",
      "fail \"runtimeInfrastructure.localRegistry was replaced; configure runtimeInfrastructure.registry endpoint/transport/auth explicitly (docs/site/understand/platform-and-operations.md#writable-local-oci-registry)\"",
      "end",
      "$registry := deepCopy $settings.registry",
      "$mirror := deepCopy $settings.dockerHubMirror",
      "range $name, $client := dict \"registry\" $registry \"dockerHubMirror\" $mirror",
      "if or (eq $name \"registry\") $client.endpoint",
      "$endpoint := required (printf \"runtimeInfrastructure.%s.endpoint is required; configure a node-reachable registry origin\" $name) $client.endpoint",
      "if not (has $client.transport (list \"https\" \"http-lab\"))",
      "fail (printf \"runtimeInfrastructure.%s.transport must explicitly select https or http-lab\" $name)",
      "end",
      "$scheme := ternary \"https://\" \"http://\" (eq $client.transport \"https\")",
      "if not (and (hasPrefix $scheme $endpoint) (regexMatch \"^https?://[a-z0-9.-]+(:[0-9]+)?/?$\" $endpoint))",
      "fail (printf \"runtimeInfrastructure.%s endpoint scheme/host does not match transport\" $name)",
      "end",
      "if ne (not (empty $client.caSecretName)) (not (empty $client.nodeCaFile))",
      "fail \"custom CA requires both caSecretName and nodeCaFile\"",
      "end",
      "if and $client.nodeCaFile (not (regexMatch \"^/[^\\r\\n]+$\" $client.nodeCaFile))",
      "fail \"nodeCaFile must be an absolute host path\"",
      "end",
      "if $client.caSecretName",
      "if ne $client.transport \"https\"",
      "fail \"registry CA requires HTTPS\"",
      "end",
      "$_ := required (printf \"runtimeInfrastructure.%s.nodeCaFile is required with custom CA\" $name) $client.nodeCaFile",
      "$_ := set $client \"caFile\" (printf \"/var/run/kubeclaw-%s-trust/ca.crt\" $name)",
      "end",
      "end",
      "end",
      "if and $mirror.endpoint (eq (trimSuffix \"/\" $mirror.endpoint) (trimSuffix \"/\" $registry.endpoint))",
      "fail \"writable registry and Docker Hub mirror must be distinct\"",
      "end",
      "if and $mirror.endpoint (or (regexMatch \"^https?://docker[.]io/?$\" $mirror.endpoint) (regexMatch \"^https?://docker[.]io/?$\" $registry.endpoint))",
      "fail \"Docker Hub mirror routing collides with docker.io endpoint\"",
      "end",
      "$env := list (dict \"name\" \"KUBECLAW_REGISTRY_CONFIG\" \"value\" (toJson (dict \"schemaVersion\" \"registry-clients.v1\" \"registry\" $registry \"dockerHubMirror\" $mirror)))",
      "if eq $registry.transport \"https\"",
      "$secret := required \"runtimeInfrastructure.registry.authSecretName is required for HTTPS registry authentication\" $registry.authSecretName",
      "$_ := set $registry \"auth\" (dict \"usernameEnvironmentVariable\" \"KUBECLAW_REGISTRY_USERNAME\" \"passwordEnvironmentVariable\" \"KUBECLAW_REGISTRY_PASSWORD\")",
      "$env = list (dict \"name\" \"KUBECLAW_REGISTRY_CONFIG\" \"value\" (toJson (dict \"schemaVersion\" \"registry-clients.v1\" \"registry\" $registry \"dockerHubMirror\" $mirror)))",
      "range $kind, $key := dict \"USERNAME\" $registry.usernameKey \"PASSWORD\" $registry.passwordKey",
      "$env = append $env (dict \"name\" (printf \"KUBECLAW_REGISTRY_%s\" $kind) \"valueFrom\" (dict \"secretKeyRef\" (dict \"name\" $secret \"key\" (required \"registry credential secret key is required\" $key))))",
      "end",
      "else if $registry.authSecretName",
      "fail \"HTTP lab registry cannot send credentials\"",
      "end",
      "$mounts := $container.volumeMounts | default list",
      "range $name, $client := dict \"registry\" $registry \"dockerHubMirror\" $mirror",
      "if $client.caSecretName",
      "$mounts = append $mounts (dict \"name\" (printf \"registry-client-%s\" (lower $name)) \"mountPath\" (printf \"/var/run/kubeclaw-%s-trust\" $name) \"readOnly\" true)",
      "end",
      "end",
      "range $entry := $container.env | default list",
      "if or (hasPrefix \"KUBECLAW_REGISTRY_\" $entry.name) (has $entry.name (list \"KUBECLAW_LOCAL_REGISTRY\" \"CONTAINER_BUILD_REGISTRY_REFERENCE\" \"CONTAINER_BUILD_REGISTRY_BASE_URL\" \"NODE_EXTRA_CA_CERTS\"))",
      "fail (printf \"%s duplicates the shared registry contract; remove it from sidecar env\" $entry.name)",
      "end",
      "end",
      "if $registry.caFile",
      "$env = append $env (dict \"name\" \"NODE_EXTRA_CA_CERTS\" \"value\" $registry.caFile)",
      "end",
      "$_ := set $container \"env\" (concat ($container.env | default list) $env)",
      "$_ := set $container \"volumeMounts\" $mounts",
      "toYaml $container"
    ],
    "literalLines": []
  }
};

const ENV_HELPERS=new Set(['kubeclaw.demoReadyClientEnv','prism.productDecisions.env','kubeclaw.registryContainer']);

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lineAt = (bytes,index) => bytes.slice(0,index).split('\n').length;
const fail = (file,bytes,index,message) => assert.fail(`ENVIRONMENT_PRODUCER_HELPER_CUSTODY_UNQUALIFIED: ${file}:${lineAt(bytes,index)}: ${message}`);

// Lexical actions only: no template evaluation. Quotes and template comments
// own delimiters, so named definitions in passive strings/comments are not
// promoted into the executable namespace. Unknown named-definition syntax fails.
function templateActions(file,bytes) {
  const actions=[];
  for(let cursor=0;cursor<bytes.length;) {
    const start=bytes.indexOf('{{',cursor);
    if(start<0) break;
    let index=start+2,quote=null,comment=false,escaped=false;
    for(;index<bytes.length;index++) {
      const char=bytes[index];
      if(comment) { if(bytes.slice(index,index+2)==='*/') {comment=false;index++;}continue; }
      if(quote) {
        if(quote!=='`'&&escaped) {escaped=false;continue;}
        if(quote!=='`'&&char==='\\') {escaped=true;continue;}
        if(char===quote) quote=null;
        continue;
      }
      if(bytes.slice(index,index+2)==='/*') {comment=true;index++;continue;}
      if(['"',"'",'`'].includes(char)) {quote=char;continue;}
      if(bytes.slice(index,index+2)==='}}') break;
      if(bytes.slice(index,index+2)==='{{') fail(file,bytes,index,'nested/unqualified template action delimiter');
    }
    if(index>=bytes.length) fail(file,bytes,start,'unterminated template action/quote/comment');
    const raw=bytes.slice(start,index+2),action=bytes.slice(start+2,index).replace(/^-\s|\s-$/gu,'').trim();
    actions.push({index:start,end:index+2,raw,action});cursor=index+2;
  }
  return actions;
}

function literalHelperCalls(action) {
  const calls=[];
  for(let index=0;index<action.length;) {
    if(action.slice(index,index+2)==='/*') {const end=action.indexOf('*/',index+2);index=end<0?action.length:end+2;continue;}
    if(['"',"'",'`'].includes(action[index])) {
      const quote=action[index++];let escaped=false;
      while(index<action.length) {const char=action[index++];if(quote!=='`'&&escaped){escaped=false;continue;}if(quote!=='`'&&char==='\\'){escaped=true;continue;}if(char===quote)break;}
      continue;
    }
    const word=/^[A-Za-z_][A-Za-z0-9_]*/u.exec(action.slice(index));
    if(!word) {index++;continue;}
    const selector=index>0&&['.','$'].includes(action[index-1]);
    index+=word[0].length;
    if(selector || !['include','template','tpl'].includes(word[0])) continue;
    if(word[0]==='tpl') {calls.push({kind:'compiler',name:null,dynamic:true});continue;}
    while(/\s/u.test(action[index]??'')&&index<action.length) index++;
    const quoted=/^("(?:[^"\\]|\\.)*"|`[^`]*`)/u.exec(action.slice(index));
    if(!quoted) {calls.push({name:null,dynamic:true});continue;}
    let name;
    try {name=quoted[1].startsWith('`')?quoted[1].slice(1,-1):JSON.parse(quoted[1]);}
    catch {calls.push({name:null,dynamic:true});index+=quoted[1].length;continue;}
    calls.push({name,dynamic:false});index+=quoted[1].length;
  }
  return calls;
}

function literalTemplateName(file,bytes,token) {
  const match=/^(define|block)\s+("(?:[^"\\]|\\.)*"|`[^`]*`)([\s\S]*)$/u.exec(token.action);
  if(!match) fail(file,bytes,token.index,'unsupported named-template definition or block selector');
  let name;
  try {name=match[2].startsWith('`')?match[2].slice(1,-1):JSON.parse(match[2]);}
  catch {fail(file,bytes,token.index,'unsupported Go-string named-template escape');}
  if(!name || typeof name!=='string' || !/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name) || (match[1]==='define'&&match[3].trim())) fail(file,bytes,token.index,'unsupported named-template definition name/pipeline');
  return {name,kind:match[1],header:token.action};
}

function definitionsAt(sourceRoot,chart,selectedSource) {
  const definitions=new Map(),chartRoot=path.join(sourceRoot,'charts',chart),directory=path.join(chartRoot,'templates');
  const chartFile=`charts/${chart}/Chart.yaml`,chartPath=path.join(sourceRoot,chartFile);
  if(!fs.existsSync(chartPath) || !fs.lstatSync(chartPath).isFile()) fail(chartFile,'',0,'missing regular checked-in chart metadata for global template namespace');
  const chartBytes=fs.readFileSync(chartPath,'utf8'),chartMetadata=YAML.parseDocument(chartBytes);
  if(chartMetadata.errors.length || !YAML.isMap(chartMetadata.contents)) fail(chartFile,chartBytes,0,'unsupported chart metadata namespace authority');
  const chartIdentity={apiVersion:chartMetadata.get('apiVersion'),name:chartMetadata.get('name'),type:chartMetadata.get('type')??null};
  if(chartIdentity.apiVersion!=='v2'||(chartIdentity.type!==null&&chartIdentity.type!=='application')||typeof chartIdentity.name!=='string'||!chartIdentity.name) fail(chartFile,chartBytes,0,'changed/unsupported chart identity or execution type for qualified template namespace');
  const dependencies=chartMetadata.get('dependencies');
  if(dependencies!==undefined && (!Array.isArray(dependencies)||dependencies.length)) fail(chartFile,chartBytes,0,'subchart dependency template namespace requires separate source qualification');
  for(const name of ['.helmignore','Chart.lock']) if(fs.existsSync(path.join(chartRoot,name))) fail(`charts/${chart}/${name}`,fs.readFileSync(path.join(chartRoot,name),'utf8'),0,'chart ignore/dependency policy changes template namespace; unsupported source boundary');
  const nested=path.join(chartRoot,'charts');
  if(fs.existsSync(nested) && (!fs.lstatSync(nested).isDirectory() || fs.lstatSync(nested).isSymbolicLink() || fs.readdirSync(nested).length)) fail(`charts/${chart}/charts`,'',0,'checked-in subchart/package template namespace requires separate source qualification');
  if(!fs.existsSync(directory) || !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) fail(`charts/${chart}/templates`,'',0,'missing/unsupported checked-in template namespace directory');
  const files=[],contributions=[],rootExecution=[];
  const collect=directory=> {
    for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      const absolute=path.join(directory,entry.name),file=path.relative(sourceRoot,absolute).split(path.sep).join('/');
      if(entry.isSymbolicLink()) fail(file,'',0,'template namespace symlink source unsupported');
      if(entry.name.startsWith('.')) fail(file,'',0,'hidden template loader exclusion/execution source requires separate namespace qualification');
      if(entry.isDirectory()) { collect(absolute);continue; }
      if(!entry.isFile()) fail(file,'',0,'non-regular template namespace source unsupported');
      // Helm parses named templates from regular templates files regardless of
      // suffix, including YAML, NOTES.txt and underscore-prefixed helpers.
      files.push(file);
      let bytes;
      try { bytes=selectedSource?.file===file?selectedSource.text:new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(absolute)); }
      catch {fail(file,'',0,'non-UTF8 template namespace source unsupported');}
      const tokens=templateActions(file,bytes),outerScopes=[],rootActions=[];
      for(const token of tokens) if(literalHelperCalls(token.action).some(call=>call.kind==='compiler')) fail(file,bytes,token.index,'dynamic tpl namespace compilation requires separate finite source qualification');
      for(let index=0;index<tokens.length;index++) {
        const action=tokens[index].action;
        if(action.startsWith('/*')) continue;
        if(!/^(?:define|block)\b/u.test(action)) {
          rootActions.push(action);
          if(/^(?:if|range|with)\s/u.test(action)) outerScopes.push(action);
          else if(/^else(?:\s|$)/u.test(action) && !outerScopes.length) fail(file,bytes,tokens[index].index,'unmatched outer namespace else');
          else if(action==='end') {
            if(!outerScopes.length) fail(file,bytes,tokens[index].index,'unmatched outer namespace end');
            outerScopes.pop();
          }
          continue;
        }
        if(outerScopes.length) fail(file,bytes,tokens[index].index,'named-template declaration in enclosing execution scope unsupported');
        const selected=literalTemplateName(file,bytes,tokens[index]);
        const prior=definitions.get(selected.name);
        if(prior) fail(file,bytes,tokens[index].index,`ambiguous named-template ${selected.name}; prior contribution ${prior.path}:${prior.line}`);
        if(selected.kind==='block') fail(file,bytes,tokens[index].index,`unsupported block namespace contribution ${selected.name}`);
        let depth=1,end=index+1;
        for(;end<tokens.length;end++) {
          const action=tokens[end].action;
          if(/^(?:define|block)\b/u.test(action)) fail(file,bytes,tokens[end].index,'nested named-template namespace contribution unsupported');
          if(/^(?:if|range|with)\s/u.test(action)) depth++;
          else if(action==='end' && --depth===0) break;
        }
        if(depth!==0) fail(file,bytes,tokens[index].index,'unterminated named-template definition');
        const start=tokens[index].end,finish=tokens[end].index;
        const body=bytes.slice(start,finish),actions=tokens.slice(index+1,end).map(token=>token.action);
        let masked=body;
        for(const token of [...tokens.slice(index+1,end)].reverse()) {
          const offset=token.index-start;
          masked=masked.slice(0,offset)+token.raw.replace(/[^\n]/gu,' ')+masked.slice(offset+token.raw.length);
        }
        const literalLines=masked.split('\n').map(line=>line.trim()).filter(Boolean);
        const definition={name:selected.name,path:file,header:selected.header,bytes,start,end:finish,body,masked,actions,literalLines,line:lineAt(bytes,tokens[index].index),
          emits:/\bname\s*:[^\n]*(?:\bvalue(?:From)?\s*:|\n\s+value(?:From)?\s*:)/u.test(body) || /\bdict\s+"name"[\s\S]*?"value(?:From)?"/u.test(body) || /\bset\s+\$[A-Za-z_][A-Za-z0-9_]*\s+"env"/u.test(body)};
        definitions.set(selected.name,definition);
        contributions.push({name:selected.name,path:file,kind:selected.kind,header:selected.header,sourceDigest:digest(body)});index=end;
      }
      if(outerScopes.length) fail(file,bytes,bytes.length,'unterminated outer template namespace execution scope');
      if(rootActions.length) rootExecution.push({path:file,actions:rootActions});
    }
  };
  collect(directory);
  definitions.namespace={schemaVersion:'helm-checked-in-template-namespace.v1',scope:`charts/${chart}/templates`,files,rootExecution,implicitTemplates:files.map(file=>({path:file,name:`${chartIdentity.name}/templates/${file.slice(`charts/${chart}/templates/`.length)}`})),contributions:contributions.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),dependencyAuthority:{chartPath:chartFile,chartIdentity,dependencies:dependencies??[],subcharts:'absent or empty',ignorePolicy:'no checked-in .helmignore; hidden template entries require separate loader qualification',lockPolicy:'no checked-in Chart.lock'}};
  let changed=true;
  while(changed) {
    changed=false;
    for(const definition of definitions.values()) if(!definition.emits && templateActions(definition.path,definition.body).some(token=>literalHelperCalls(token.action).some(call=>definitions.get(call.name)?.emits))) { definition.emits=true;changed=true; }
  }
  return definitions;
}

function validationExecutionContext(file,body,index) {
  const scopes=[{directive:'root',bindings:[]}];
  for(const token of templateActions(file,body.slice(0,index))) {
    const action=token.action;
    if(action.startsWith('/*')) continue;
    if(/^(?:if|range|with)\s/u.test(action)) {const space=action.indexOf(' ');scopes.push({directive:action.slice(0,space),expression:action.slice(space+1),bindings:[]});}
    else if(/^else(?:\s|$)/u.test(action)) {
      if(scopes.length===1) fail(file,body,token.index,'unmatched validation execution else');
      scopes[scopes.length-1]={...scopes.at(-1),branch:action,bindings:[]};
    } else if(action==='end') {
      if(scopes.length===1) fail(file,body,token.index,'unmatched validation execution end');
      scopes.pop();
    } else if(/^(?:define|block)\b/u.test(action)) fail(file,body,token.index,'named template declaration in validator execution source unsupported');
    else if(/^\$[A-Za-z_][A-Za-z0-9_]*\s*(?::=|=)/u.test(action)) scopes.at(-1).bindings.push({directive:'binding',expression:action});
  }
  return {schemaVersion:'helm-validator-execution-custody.v1',guards:scopes.slice(1).map(({bindings,...guard})=>guard),bindingScopes:scopes.map(scope=>({scope:scope.directive,expression:scope.expression??null,bindings:scope.bindings}))};
}

function checkedDefinition(definitions,name) {
  const definition=definitions.get(name),recipe=RECIPES[name];
  if(!definition || !recipe) assert.fail(`ENVIRONMENT_PRODUCER_HELPER_CUSTODY_UNQUALIFIED: ${definition?.path??name}:${definition?.line??1}: missing finite helper recipe`);
  if(definition.path!==recipe.path || JSON.stringify(definition.actions)!==JSON.stringify(recipe.actions) || JSON.stringify(definition.literalLines)!==JSON.stringify(recipe.literalLines)) fail(definition.path,definition.bytes,definition.start,`changed/unrecognized selected helper directives or declarations in ${name}`);
  return definition;
}

function guardsAt(definition,index) {
  const bindings=[],stack=[];
  for(const token of definition.body.slice(0,index).matchAll(/\{\{-?\s*([\s\S]*?)\s*-?\}\}/gu)) {
    const action=token[1].trim();
    if(/^\$[A-Za-z_][A-Za-z0-9_]*\s*(?::=|=)/u.test(action)) bindings.push({directive:'binding',expression:action});
    if(/^(?:if|range|with)\s/u.test(action)) { const space=action.indexOf(' ');stack.push({directive:action.slice(0,space),expression:action.slice(space+1)}); }
    else if(/^else(?:\s|$)/u.test(action)) stack[stack.length-1]={...stack.at(-1),branch:action};
    else if(action==='end') stack.pop();
  }
  return [...bindings,...stack];
}

function yamlPurposeAt(text,index,indent) {
  const preceding=text.slice(0,index).split('\n').slice(0,-1);
  for(let line=preceding.length-1;line>=0;line--) {
    if(!preceding[line].trim() || /^\s*(?:#|\{\{)/u.test(preceding[line])) continue;
    const selected=/^(\s*)(?:-\s+)?([A-Za-z_][A-Za-z0-9_]*):/u.exec(preceding[line]);
    if(selected && selected[1].length<indent) return selected[2];
    if(/^\s*\S/u.test(preceding[line]) && /^\s*/u.exec(preceding[line])[0].length<indent) return null;
  }
  return null;
}

const receipt = definition => ({name:definition.name,path:definition.path,actions:definition.actions,literalLines:definition.literalLines,sourceDigest:digest(definition.body)});

function literalProjections(definition) {
  const document=YAML.parseDocument(definition.masked,{keepSourceTokens:true,uniqueKeys:false});
  if(document.errors.length || !YAML.isSeq(document.contents)) fail(definition.path,definition.bytes,definition.start,'selected helper is not a finite environment declaration sequence');
  return document.contents.items.map(node=> {
    const name=node.get('name',true),value=node.get('value',true);
    if(!YAML.isMap(node) || !YAML.isScalar(name) || typeof name.value!=='string') fail(definition.path,definition.bytes,definition.start+node.range[0],'nonliteral helper environment name');
    const raw=definition.body.slice(node.range[0],node.range[1]);
    return {name:name.value,sourcePath:definition.path,sourceLine:lineAt(definition.bytes,definition.start+name.range[0]),range:[definition.start+node.range[0],definition.start+node.range[1]],sourceDigest:digest(raw),guards:guardsAt(definition,name.range[0]),
      secretProvenance:/\bsecretKeyRef\s*:/u.test(raw),literalValue:YAML.isScalar(value)?value.value:null,
      valueAuthority:YAML.isScalar(value)&&value.value!==null?{kind:'literal',value:value.value}:{kind:'helm-value',expression:/\bvalue:\s*\{\{-?\s*([\s\S]*?)\s*-?\}\}/u.exec(raw)?.[1]??'<unsupported>'}};
  });
}

function registryProjections(definition) {
  // A finite source-shaped list/dict builder. The recipe above proves there are
  // exactly these producing assignments and no unhandled env mutation. We read
  // actual dict literal/printf names and finite range keys from those statements.
  const config=definition.actions.filter(action=>/^\$env\s*(?::=|=)\s*list\s+\(dict "name"/u.test(action));
  if(config.length!==2) fail(definition.path,definition.bytes,definition.start,'unsupported registry config reassignment');
  const configNames=config.map(action=>/^\$env\s*(?::=|=)\s*list\s+\(dict "name" "([^"\n]+)"/u.exec(action)?.[1]);
  if(!configNames[0] || configNames[0]!==configNames[1]) fail(definition.path,definition.bytes,definition.start,'registry config assignments disagree');
  const range=definition.actions.find(action=>/^range \$kind, \$key := dict /u.test(action));
  const pairs=[...range.matchAll(/"([^"\n]+)" (\$registry\.[A-Za-z_][A-Za-z0-9_]*)/gu)];
  const append=definition.actions.find(action=>action.includes('(printf "KUBECLAW_REGISTRY_%s" $kind)'));
  const format=/\(printf "([^"\n]+%s[^"\n]*)" \$kind\)/u.exec(append)?.[1];
  const ca=definition.actions.find(action=>/^\$env = append \$env \(dict "name" "[^"\n]+" "value" \$registry\.caFile\)$/u.test(action));
  const caName=/\(dict "name" "([^"\n]+)"/u.exec(ca)?.[1];
  if(pairs.length!==2 || !format || !caName) fail(definition.path,definition.bytes,definition.start,'unsupported registry finite env append');
  const projected=(name,selected,branch,secretProvenance=false,finiteKey=null)=> {
    const offset=definition.body.indexOf(selected[0]);
    return {name,sourcePath:definition.path,sourceLine:lineAt(definition.bytes,definition.start+offset),range:[definition.start+offset,definition.start+offset+selected[0].length],sourceDigest:digest(selected.join('\n')),guards:branch,secretProvenance,literalValue:null,finiteKey,valueAuthority:{kind:secretProvenance?'secret-key-ref-builder':'helm-env-list-builder',statements:selected,finiteKey}};
  };
  return [projected(configNames[0],config,[{directive:'all-producing-branches',expression:'initial config list; HTTPS replacement follows registry.auth mutation'}]),
    ...pairs.map(pair=>projected(format.replace('%s',pair[1]),[append,range],[{directive:'if',expression:'eq $registry.transport "https"'},{directive:'range',expression:range.slice(6)}],true,{key:pair[1],valueSelector:pair[2]})),
    projected(caName,[ca],[{directive:'if',expression:'$registry.caFile'}])];
}

export function helmEnvironmentHelperProjectionPlans({file,text,sourceRoot}) {
  const chart=/^charts\/([^/]+)\/templates\//u.exec(file)?.[1];
  if(!chart) return [];
  const definitions=definitionsAt(sourceRoot,chart,{file,text}),plans=[];
  for(const token of templateActions(file,text)) {
    const action=token.action,prefix=text.slice(text.lastIndexOf('\n',token.index-1)+1,token.index);
    if(action.startsWith('/*')) continue;
    if(prefix.trim()==='' && /^(?:include|template)\s+[^"\s]/u.test(action)) fail(file,text,token.index,'dynamic standalone helper selection requires finite actual rendered-payload custody');
    for(const call of literalHelperCalls(action)) {
      const candidate=definitions.get(call.name);
      const rendersPayload=!/^(?:\$[A-Za-z_][A-Za-z0-9_]*\s*(?::=|=)|(?:if|range|with|else|end|define|block)\b)/u.test(action);
      const purpose=rendersPayload && (prefix.trim()===''||prefix.trim()==='-')?yamlPurposeAt(text,token.index,prefix.length):null;
      if(!candidate?.emits && !ENV_HELPERS.has(call.name) && !['env','extraEnv','containers','initContainers','extraContainers'].includes(purpose)) continue;
      if(!candidate) fail(file,text,token.index,`unknown/unqualified helper selector ${call.name??'<dynamic>'} in actual environment/container purpose`);
      const definition=checkedDefinition(definitions,call.name);
      const registry=definition.name==='kubeclaw.registryContainer';
      const expected=registry?'include "kubeclaw.registryContainer" (dict "root" $ "container" .) | nindent 10 | trim':definition.name==='prism.productDecisions.env'?'include "prism.productDecisions.env" $ | nindent 12':'include "kubeclaw.demoReadyClientEnv" . | nindent 12';
      if(action!==expected || prefix.trim()!==(registry?'-':'')) fail(file,text,token.index,'changed/unrecognized env helper caller arguments or placement');
      const dependencies=[];
      if(definition.name==='kubeclaw.demoReadyClientEnv') {
        const invocation=templateActions(definition.path,definition.body).filter(token=>token.action==='include "kubeclaw.demoReadyClientValidate" .');
        if(invocation.length!==1) fail(definition.path,definition.bytes,definition.start,'ready-client validator invocation ambiguous/missing');
        const execution=validationExecutionContext(definition.path,definition.body,invocation[0].index);
        if(execution.guards.length) fail(definition.path,definition.bytes,definition.start+invocation[0].index,'ready-client validator execution must be unconditional in env helper');
        dependencies.push({definition:receipt(checkedDefinition(definitions,'kubeclaw.demoReadyClientValidate')),invocation:{scope:'inside env helper',expression:invocation[0].action,execution}});
      }
      if(definition.name==='prism.productDecisions.env') {
        const validator=checkedDefinition(definitions,'prism.productDecisions.validate');
        const invocations=templateActions(file,text.slice(0,token.index)).filter(invocation=>invocation.action==='include "prism.productDecisions.validate" .');
        if(invocations.length!==1) fail(file,text,token.index,'product decision env requires exactly one actual preceding root validation invocation');
        const invocationGuards=guardsAt({body:text},invocations[0].index);
        if(invocationGuards.some(guard=>guard.directive!=='binding')) fail(file,text,invocations[0].index,'product decision validation must be an unconditional root invocation');
        const execution=validationExecutionContext(file,text,invocations[0].index);
        if(execution.guards.length) fail(file,text,invocations[0].index,'product decision validator execution must be unconditional at caller root');
        dependencies.push({definition:receipt(validator),invocation:{scope:'preceding caller root',expression:invocations[0].raw,guards:invocationGuards,execution,sourceDigest:digest(invocations[0].raw)}});
      }
      let incomingContainer=null;
      if(registry) {
        const preceding=templateActions(file,text.slice(0,token.index));
        const starts=preceding.map((candidate,index)=>({candidate,index})).filter(({candidate})=>candidate.action==='$registryWorkers := 0');
        if(starts.length!==1) fail(file,text,token.index,'registry incoming container lacks one unambiguous actual exact-one-worker validation');
        const required=['$registryWorkers := 0','range .Values.extraContainers','if eq .name "buster-v2-runtime"','$registryWorkers = add1 $registryWorkers','end','end','if or (gt (int $registryWorkers) 1) (and (eq .Values.agentRole "buster") (ne (int $registryWorkers) 1))','fail "Buster registry configuration requires exactly one extraContainers entry named buster-v2-runtime"','end'];
        const selectedTokens=preceding.slice(starts[0].index,starts[0].index+required.length),selected=selectedTokens.map(candidate=>candidate.action);
        if(JSON.stringify(selected)!==JSON.stringify(required)) fail(file,text,token.index,'changed exact-one-worker registry caller validation');
        const validation={index:selectedTokens[0].index,source:text.slice(selectedTokens[0].index,selectedTokens.at(-1).end)};
        const execution=validationExecutionContext(file,text,validation.index);
        if(execution.guards.length) fail(file,text,validation.index,'registry exact-one-worker validator execution must be unconditional at caller root');
        dependencies.push({callerValidation:{actions:selected,execution,sourceDigest:digest(validation.source)}});
        const sourceStatements=definition.actions.filter(action=>action==='$container := deepCopy .container' || action==='toYaml $container' || action.startsWith('$_ := set $container \"env\"') || action.startsWith('range $entry := $container.env') || action.includes('duplicates the shared registry contract'));
        incomingContainer={sourceStatements,sourceDigest:digest(sourceStatements.join('\n')),selector:'.Values.extraContainers',selectedName:'buster-v2-runtime',imageSelector:'.container.image',commandSelector:'.container.command/.container.args',environmentSelector:'.container.env | default list',copy:'deepCopy .container',merge:'set $container "env" (concat ($container.env | default list) $env)',scope:'caller-selected values container; arbitrary overrides are transport only, not first-party reader delivery proof'};
      }
      plans.push({start:token.index,end:token.end,line:lineAt(text,token.index),prefix,registry,
        helperProjection:{schemaVersion:'helm-environment-helper-projection.v1',namespace:definitions.namespace,helper:receipt(definition),dependencies,caller:{expression:action},incomingContainer},
        projections:registry?registryProjections(definition):literalProjections(definition)});
    }
  }
  return plans;
}
