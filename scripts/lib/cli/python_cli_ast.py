#!/usr/bin/env python3
"""Static CLI source facts; never import or execute supplied programs."""
import ast
import copy
import hashlib
import json
import sys

# Qualified finite stdlib receiver contract. These are semantic AST fingerprints of
# the exact receiver methods qualified in the retained external prerequisite receipt,
# not a host file hash or Python patch-version value in the generated source model.
# Formatting, comments and docstrings are excluded; executable AST drift fails closed.
_ARGPARSE_CONTRACT_METHODS = {'ArgumentParser.__init__': '2fc5e55861fe4e10efdd0d0c1880b5aac0cd0d798d08a5e41131000cb46fc1ba', 'ArgumentParser.parse_args': '118d45ccdc580efd74c67761c09c2d9f02c36bfba2d8d42f32e8a1a369ce54c0', 'ArgumentParser.parse_known_args': 'fc6660cee6c5563f80651e3476b02ec63be31543f98afc986a593007e83f88de', 'ArgumentParser.exit': '67b2f65ded6ae8dfb4f8455a2060c4ad662a43fccc5e30ce23a49a5c18795b72', 'ArgumentParser.error': '9b045f4ecb1311a4c2a88b1f8579104445d8660940d1232489ff257f40a44ae5', '_ActionsContainer.add_argument': 'c92cc7981367066841289cd3556401ba4c1ec4001b0bf3251960d9d5eec0e845', '_ActionsContainer.set_defaults': 'ded514ae7ca1330a207ed7b9be7b622f115f8f7218f7258bc6f01dd8be04bb70', '_StoreTrueAction.__init__': 'b12ff063656b92fe3889b442f30342eb8aad856ebcd0ccab6923f8c25bdfbce3', '_StoreFalseAction.__init__': '241fba379d8150f28f30c452432508c41b99af4dff13d68968a6daafffdaf78c', '_HelpAction.__call__': '758092ac83ce689ff6a8561ec6b1fb777451a2d413fd976e63ed37fa04f373b9', 'ArgumentParser.add_subparsers': '5a1e50c3ac3154ab05b896dd61bf3e5742c098e69e76b29380e1af97d5710284', '_SubParsersAction.add_parser': 'b2d272f98eb38f40071d27d8a75401c205fad6551cf770e001839ea69bedb541'}

def qualify_argparse_stdlib_source(text):
    """Pure source qualification; supplied text is parsed only, never imported/run."""
    try:
        tree = ast.parse(text, filename='<selected-stdlib-argparse-prerequisite>')
    except SyntaxError as error:
        raise RuntimeError('CLI_ARGPARSE_PREREQUISITE_SYNTAX') from error
    classes = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            if node.name in classes:
                raise RuntimeError('CLI_ARGPARSE_PREREQUISITE_DUPLICATE_CLASS:' + node.name)
            classes[node.name] = node
    for selector, expected in _ARGPARSE_CONTRACT_METHODS.items():
        cls, name = selector.split('.')
        matches = [node for node in getattr(classes.get(cls), 'body', [])
                   if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name]
        if len(matches) != 1:
            raise RuntimeError('CLI_ARGPARSE_PREREQUISITE_MISSING_OR_AMBIGUOUS:' + selector)
        # Reparse a copy so qualification cannot change the caller's AST.
        method = ast.parse(ast.unparse(matches[0])).body[0]
        if (method.body and isinstance(method.body[0], ast.Expr)
                and isinstance(method.body[0].value, ast.Constant)
                and isinstance(method.body[0].value.value, str)):
            method.body.pop(0)
        canonical = ast.dump(method, annotate_fields=True, include_attributes=False)
        if hashlib.sha256(canonical.encode('utf-8')).hexdigest() != expected:
            raise RuntimeError('CLI_ARGPARSE_PREREQUISITE_CONTRACT_CHANGED:' + selector)
    return {'contract': 'cpython-stdlib-argparse-semantic-v1', 'qualified': True}

def qualify_selected_argparse_prerequisite():
    # This imports only interpreter stdlib discovery, never argparse or product code.
    import os
    import sysconfig
    if sys.implementation.name != 'cpython' or sys.version_info < (3, 11):
        raise RuntimeError('CLI_ARGPARSE_PREREQUISITE_REQUIRES_CPYTHON_3_11_OR_NEWER')
    selected = os.path.join(sysconfig.get_path('stdlib'), 'argparse.py')
    with open(selected, encoding='utf-8') as source:
        return qualify_argparse_stdlib_source(source.read())

def extract_source(item):
    path, text = item['path'], item['text']
    result = {'path': path, **{k: [] for k in ('commands','options','positionals','defaults','exits','branches','delegations','guards','sourceBindings','unresolved')}}
    try:
        tree = ast.parse(text, filename=path)
    except SyntaxError as error:
        result['unresolved'].append({'rule':'syntax-error','line':error.lineno,'column':error.offset,'message':error.msg})
        return result
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    lines = text.splitlines(keepends=True)
    offsets = [0]
    for line in lines: offsets.append(offsets[-1] + len(line.encode('utf-8')))
    def site(node):
        # Python AST columns are UTF-8 byte offsets, not Unicode code-point offsets.
        start = offsets[node.lineno-1] + node.col_offset
        end = offsets[node.end_lineno-1] + node.end_col_offset
        guards=[]
        previous=node
        ancestor=parents.get(node)
        while ancestor is not None:
            if isinstance(ancestor,(ast.FunctionDef,ast.AsyncFunctionDef,ast.Lambda)):break
            if isinstance(ancestor,ast.If):guards.append({'conditionExpression':ast.unparse(ancestor.test),'line':ancestor.lineno,'role':'then' if previous in ancestor.body else 'else' if previous in ancestor.orelse else 'condition'})
            elif isinstance(ancestor,(ast.For,ast.AsyncFor,ast.While,ast.Try,ast.With,ast.AsyncWith,ast.Match)):
                guards.append({'conditionExpression':ast.unparse(ancestor.test) if isinstance(ancestor,ast.While) else ast.unparse(ancestor.iter) if isinstance(ancestor,(ast.For,ast.AsyncFor)) else type(ancestor).__name__,'line':ancestor.lineno,'role':'source-bound-loop-exception-context-or-pattern-path','controlKind':type(ancestor).__name__})
            previous=ancestor
            ancestor=parents.get(ancestor)
        return {'conditions':guards,'line':node.lineno,'endLine':node.end_lineno,'startByte':start,'endByte':end,'expression':text.encode('utf-8')[start:end].decode('utf-8')}
    def fact(key,node,**fields): result[key].append({**site(node),**fields})
    def qualified(node, env):
        if isinstance(node,ast.Name): return env.get(node.id)
        if isinstance(node,ast.Attribute):
            parent=qualified(node.value,env)
            return parent+'.'+node.attr if parent else None
        return None
    def argv_nodes(node,env):
        return [n for n in ast.walk(node) if qualified(n,env) in ('sys.argv','cli.argv-array','cli.argv-value')]
    def exception_context(node):
        result=[];child=node;ancestor=parents.get(node)
        while ancestor is not None:
            if isinstance(ancestor,(ast.FunctionDef,ast.AsyncFunctionDef,ast.Lambda)):break
            if isinstance(ancestor,ast.Try):result.append({'source':site(ancestor),'origin':'try' if child in ancestor.body else 'except' if isinstance(child,ast.ExceptHandler) else 'finally' if child in ancestor.finalbody else 'else','handlers':[{'typeExpression':ast.unparse(h.type) if h.type else None,'source':site(h)} for h in ancestor.handlers],'finallySources':[site(x) for x in ancestor.finalbody],'policy':'Exception type match and finally completion remain source-bound; no unconditional numeric process status.'})
            child=ancestor;ancestor=parents.get(ancestor)
        return result
    receiver_expressions={}
    def make_parser_config(value,receiver_type,scope):
        if value in receiver_expressions: return receiver_expressions[value]
        # Factory overrides and expanded arguments do not prove a stdlib receiver.
        if any(kw.arg is None or kw.arg in ('parser_class', 'action') for kw in value.keywords) or any(isinstance(arg, ast.Starred) for arg in value.args):
            fact('unresolved',value,rule='argparse-factory-receiver-unqualified',scope=scope,policy='Do not infer native help, defaults, dispatch or exit behavior from a custom or expanded factory.')
            receiver_expressions[value]=None
            return None
        config={'constructorSource':site(value),'receiverType':receiver_type,'overrides':{},**{kw.arg:ast.unparse(kw.value) for kw in value.keywords if kw.arg}}
        fact('delegations',value,kind='argparse-bound-constructor',configuration=config,scope=scope,receiverContract='cpython-stdlib-argparse-semantic-v1')
        if config['receiverType']=='ArgumentParser':
            help_expr=config.get('add_help','True');prefix_expr=config.get('prefix_chars',repr('-'))
            try:prefix=ast.literal_eval(prefix_expr)
            except (ValueError,SyntaxError):prefix=None
            if help_expr!='False' and isinstance(prefix,str) and prefix:
                prefix='-' if '-' in prefix else prefix[0]
                for name in (prefix+'h',prefix*2+'help'):fact('options',value,name=name,kind='argparse-implicit-help-option',addHelpExpression=help_expr,scope=scope,receiverContract='cpython-stdlib-argparse-semantic-v1')
                fact('delegations',value,kind='argparse-help-action-installation',addHelpExpression=help_expr,scope=scope,receiverContract='cpython-stdlib-argparse-semantic-v1')
            elif help_expr!='False':fact('unresolved',value,rule='argparse-computed-help-prefix',prefixExpression=prefix_expr,scope=scope)
            for key in ('add_help','exit_on_error','argument_default','allow_abbrev','usage','prefix_chars','parents','conflict_handler'):
                fact('defaults',value,kind='argparse-sourcebound-constructor-policy',bindingExpression=key,valueExpression=config.get(key,{'add_help':'True','exit_on_error':'True','argument_default':'None','allow_abbrev':'True','usage':'None','prefix_chars':repr('-'),'parents':'[]','conflict_handler':repr('error')}[key]),implicitWhenOmitted=key not in config,scope=scope,receiverContract='cpython-stdlib-argparse-semantic-v1')
        receiver_expressions[value]=config
        return config
    def receiver_config(value,env,parsers,scope):
        if isinstance(value,ast.Name): return parsers.get(value.id)
        if not isinstance(value,ast.Call): return None
        if qualified(value.func,env)=='argparse.ArgumentParser':
            return make_parser_config(value,'ArgumentParser',scope)
        if isinstance(value.func,ast.Attribute):
            parent=receiver_config(value.func.value,env,parsers,scope)
            if parent is not None:
                method=value.func.attr
                valid=(parent.get('receiverType')=='ArgumentParser' and method=='add_subparsers' or parent.get('receiverType')=='SubParsersAction' and method=='add_parser')
                if valid and method not in parent.get('overrides',{}):
                    return make_parser_config(value,'SubParsersAction' if method=='add_subparsers' else 'ArgumentParser',scope)
                fact('unresolved',value,rule='argparse-chained-call-result-not-qualified-parser-receiver',method=method,scope=scope,constructor=parent.get('constructorSource'))
        return None
    def inspect(node,env,parsers,scope):
        if isinstance(node,ast.Raise):fact('exits',node,kind='python-raised-completion',valueExpression=ast.unparse(node.exc) if node.exc else None,exceptionContext=exception_context(node),scope=scope)
        if isinstance(node,ast.Return):fact('exits',node,kind='python-function-return-completion',valueExpression=ast.unparse(node.value) if node.value else None,scope=scope,policy='Returned to actual caller; not automatically a process exit code.')
        if isinstance(node,ast.Compare) and argv_nodes(node,env):
            fact('branches',node,scope=scope,kind='argv-alias-comparison')
            for literal in ast.walk(node):
                if isinstance(literal,ast.Constant) and isinstance(literal.value,str):fact('options' if literal.value.startswith('-') else 'commands',literal,name=literal.value,scope=scope,kind='argv-alias-comparison-literal')

        if isinstance(node,ast.Subscript) and qualified(node.value,env) in ('sys.argv','cli.argv-array'):
            fact('positionals',node,selector=ast.unparse(node.slice),scope=scope,kind='argv-access-not-yet-public-operand')
        if isinstance(node,ast.If) and (argv_nodes(node.test,env) or '__name__' in ast.unparse(node.test)):
            fact('branches',node.test,scope=scope,kind='argv-condition' if argv_nodes(node.test,env) else 'entry-guard')
            if not argv_nodes(node.test,env): fact('guards',node.test,scope=scope)
            else:
                for literal in ast.walk(node.test):
                    if isinstance(literal,ast.Constant) and isinstance(literal.value,str):
                        fact('options' if literal.value.startswith('-') else 'commands',literal,name=literal.value,scope=scope,kind='argv-branch-literal-not-standalone-route')
        if isinstance(node,ast.Call):
            callee=qualified(node.func,env)
            if callee=='argparse.ArgumentParser': make_parser_config(node,'ArgumentParser',scope)
            if callee=='sys.exit' or isinstance(node.func,ast.Name) and node.func.id=='exit' and env.get('exit')=='sys.exit':
                fact('exits',node,valueExpression=ast.unparse(node.args[0]) if node.args else None,scope=scope,kind='explicit-sys-exit')
            if isinstance(node.func,ast.Name) and node.func.id=='SystemExit' and env.get('SystemExit','builtins.SystemExit')=='builtins.SystemExit':
                raised=isinstance(parents.get(node),ast.Raise) and parents[node].exc is node
                fact('exits' if raised else 'delegations',node,valueExpression=ast.unparse(node.args[0]) if node.args else None,scope=scope,kind='raised-SystemExit' if raised else 'SystemExit-object-construction-not-termination',exceptionContext=exception_context(node))
            config=receiver_config(node.func.value,env,parsers,scope) if isinstance(node.func,ast.Attribute) else None
            if config is not None:
                owner=node.func.value.id if isinstance(node.func.value,ast.Name) else ast.unparse(node.func.value); method=node.func.attr
                if config.get('receiverType')=='SubParsersAction' and method!='add_parser' or config.get('receiverType')=='ArgumentParser' and method=='add_parser':
                    fact('unresolved',node,rule='argparse-action-is-not-parser-receiver',method=method,constructor=config.get('constructorSource'),scope=scope)
                    method='wrong-receiver:'+method
                if method in config.get('overrides',{}):
                    fact('unresolved',node,rule='argparse-receiver-method-overridden',method=method,overrideSource=config['overrides'][method],scope=scope)
                    method='overridden:'+method
                if method=='add_argument':
                    for a in node.args:
                        if isinstance(a,ast.Constant) and isinstance(a.value,str): fact('options' if a.value.startswith('-') else 'positionals',a,name=a.value,scope=scope,kind='argparse-declaration',parser=owner)
                        else: fact('unresolved',a,rule='computed-argparse-name',parser=owner)
                    keywords={kw.arg:ast.unparse(kw.value) for kw in node.keywords if kw.arg}
                    action=keywords.get('action',repr('store'))
                    default=keywords.get('default')
                    if default is None:
                        default=config.get('argument_default') if config.get('argument_default','None')!='None' else 'False' if action in (repr('store_true'),'"store_true"') else 'True' if action in (repr('store_false'),'"store_false"') else config.get('argument_default','None')
                    names=[a.value for a in node.args if isinstance(a,ast.Constant) and isinstance(a.value,str)]
                    dest=keywords.get('dest')
                    if dest is not None:
                        try: dest=ast.literal_eval(dest)
                        except (ValueError,SyntaxError): dest=None
                    elif names:
                        try: prefix=ast.literal_eval(config.get('prefix_chars',repr('-')))
                        except (ValueError,SyntaxError): prefix=None
                        if isinstance(prefix,str) and prefix:
                            optional=[name for name in names if name and name[0] in prefix]
                            long=[name for name in optional if len(name)>1 and name[1] in prefix]
                            dest=(long or optional or names)[0]
                            if optional: dest=dest.lstrip(prefix).replace('-','_')
                    if not isinstance(dest,str): dest=None
                    prior=config.get('parserDefaultValues',{}).get(dest)
                    uncertain=bool(site(node)['conditions']) or any(kw.arg is None for kw in node.keywords) or dest is None
                    if 'default' not in keywords:
                        if prior is not None: default=prior['valueExpression']; uncertain=uncertain or prior['unresolved']
                        elif config.get('unknownParserDefaults'): uncertain=True
                    state={'destination':dest,'valueExpression':None if uncertain else default,'unresolved':uncertain,'source':site(node),'orderedUpdates':[],'explicitDefault':'default' in keywords}
                    config.setdefault('actionDefaultStates',[]).append(state)
                    fact('defaults',node,kind='argparse-action-default-policy',valueExpression=state['valueExpression'],destination=dest,explicitDefault='default'in keywords,actionExpression=action,parser=owner,scope=scope,receiverContract='cpython-stdlib-argparse-semantic-v1',policy='Declaration-time default only: explicit default, otherwise prior set_defaults for destination, then receiver/action default. Later set_defaults updates existing actions even when their declaration default was explicit; dispatch carries the ordered source-bound snapshot, not this earlier value as effective authority.',priorParserDefaultSources=copy.deepcopy(config.get('parserDefaults',[])),unresolved=uncertain)
                    if uncertain: fact('unresolved',node,rule='argparse-action-default-requires-source-path-or-keyword-resolution',parser=owner,destination=dest,scope=scope)
                    for kw in node.keywords:
                        if kw.arg is None: fact('unresolved',kw.value,rule='expanded-argparse-keywords',parser=owner)
                        if kw.arg in ('default','required','action','nargs','type','choices','dest'): fact('defaults',kw.value,role='argparse-'+kw.arg,parser=owner,scope=scope)
                elif method in ('add_subparsers','add_parser'):
                    receiver_config(node,env,parsers,scope)
                    fact('commands',node,kind='argparse-'+method,parser=owner,scope=scope,name=node.args[0].value if method=='add_parser' and node.args and isinstance(node.args[0],ast.Constant) and isinstance(node.args[0].value,str) else None,commandNameExpression=ast.unparse(node.args[0]) if method=='add_parser' and node.args else None)
                elif method in ('parse_args','parse_known_args'):
                    fact('delegations',node,kind='argparse-dispatch',parser=owner,scope=scope,method=method,constructor=copy.deepcopy(config),namespaceDefaultPrecedence='Existing namespace values precede action defaults; each action default is changed by later set_defaults for its destination, even if initially explicit. Remaining parser defaults populate missing namespace destinations. Snapshot retains ordered updates and unresolved guards/mappings.',receiverContract='cpython-stdlib-argparse-semantic-v1')
                    if config.get('add_help','True')!='False':fact('exits',node,kind='argparse-implicit-help-policy',valueExpression='0' if 'exit' not in config.get('overrides',{}) else None,addHelpExpression=config.get('add_help','True'),overrides=config.get('overrides',{}),scope=scope,policy='Only the selected generated help action invokes the genuine exit receiver with its contract default; no unconditional termination.',receiverContract='cpython-stdlib-argparse-semantic-v1')
                    fact('exits',node,kind='argparse-sourcebound-error-policy',parser=owner,scope=scope,method=method,valueExpression='2' if not any(x in config.get('overrides',{}) for x in ('error','exit')) else None,exitOnErrorExpression=config.get('exit_on_error','True'),conditionsPolicy='parse_args leftover operands call error regardless of exit_on_error; parse_known_args catches ArgumentError only when exit_on_error is true; direct internal error calls remain receiver-bound.',overrides=config.get('overrides',{}),receiverContract='cpython-stdlib-argparse-semantic-v1')
                elif method=='set_defaults':
                    update_source=site(node)
                    config.setdefault('parserDefaults',[]).append(update_source)
                    guarded=bool(update_source['conditions'])
                    for kw in node.keywords:
                        unknown=kw.arg is None
                        value=ast.unparse(kw.value)
                        update={'destination':kw.arg,'valueExpression':None if unknown or guarded else value,'unresolved':unknown or guarded,'source':site(kw.value),'callSource':update_source}
                        if unknown:
                            config['unknownParserDefaults']=True
                            fact('unresolved',kw.value,rule='expanded-argparse-set-defaults-mapping',parser=owner,scope=scope,valueExpression=value)
                            for prior in config.setdefault('parserDefaultValues',{}).values(): prior['valueExpression']=None;prior['unresolved']=True
                        else: config.setdefault('parserDefaultValues',{})[kw.arg]=copy.deepcopy(update)
                        for state in config.get('actionDefaultStates',[]):
                            if unknown or state['destination'] is None or state['destination']==kw.arg:
                                state['orderedUpdates'].append(copy.deepcopy(update))
                                state['valueExpression']=update['valueExpression']
                                state['unresolved']=update['unresolved'] or state['destination'] is None
                        fact('defaults',kw.value,kind='argparse-ordered-parser-default',bindingExpression=kw.arg,parser=owner,scope=scope,precedenceOrder=update_source['startByte'],unresolved=unknown or guarded,policy='Updates parser defaults and all already-installed actions with the same destination, including explicit action defaults; unknown expanded mappings may update any destination.')
                else:
                    fact('unresolved',node,rule='argparse-receiver-method-not-modeled',method=method,parser=owner,scope=scope,constructor=config.get('constructorSource'))
            if callee in ('subprocess.run','subprocess.check_call','subprocess.check_output','subprocess.Popen'):
                fact('delegations',node,kind='python-subprocess-construction' if callee=='subprocess.Popen' else 'python-subprocess-execution-result',callee=callee,checkExpression=next((ast.unparse(k.value) for k in node.keywords if k.arg=='check'),None),policy='Popen constructs/starts a child; run/check calls produce result or CalledProcessError per actual check setting. Child status is not automatically parent status.',exceptionContext=exception_context(node),scope=scope)
            if callee in ('subprocess.check_call','subprocess.check_output') or callee=='subprocess.run' and any(k.arg=='check' and not(isinstance(k.value,ast.Constant) and k.value.value is False) for k in node.keywords):fact('exits',node,kind='python-checked-child-error-propagation',callee=callee,exceptionContext=exception_context(node),scope=scope,policy='A nonzero child result raises CalledProcessError only under the actual check setting; lexical handler/finally and caller decide parent completion, not automatic status inheritance.')
            if argv_nodes(node,env): fact('delegations',node,kind='argv-call-flow-not-execution-authority',scope=scope)
        if isinstance(node,(ast.Assign,ast.AnnAssign)):
            value=node.value
            if value is not None and (argv_nodes(value,env) or isinstance(value,(ast.BoolOp,ast.IfExp))):
                fact('defaults',value,scope=scope,role='source-expression-candidate-not-effective-default',assignment=ast.unparse(node))
        # Children handled with lexical environments by statements() for scope nodes.
        for child in ast.iter_child_nodes(node):
            if isinstance(child,(ast.stmt,ast.arguments)): continue
            inspect(child,env,parsers,scope)
    def targets(node):
        return [n.id for n in ast.walk(node) if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store)]
    def statements(body,env,parsers,scope):
        env=dict(env);parsers=dict(parsers)
        for node in body:
            if isinstance(node,ast.Import):
                for a in node.names: env[a.asname or a.name.split('.')[0]]=a.name
            elif isinstance(node,ast.ImportFrom):
                for a in node.names: env[a.asname or a.name]=(node.module or '')+'.'+a.name
            elif isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
                env[node.name]='local-definition';parsers.pop(node.name,None)
                sub=dict(env)
                if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
                    for a in [*node.args.posonlyargs,*node.args.args,*node.args.kwonlyargs]:sub[a.arg]='parameter'
                    if node.args.vararg:sub[node.args.vararg.arg]='parameter'
                    if node.args.kwarg:sub[node.args.kwarg.arg]='parameter'
                    # Python determines local assignment scope before statement execution.
                    for stmt in node.body:
                        for n in ast.walk(stmt):
                            if isinstance(n,ast.Name) and isinstance(n.ctx,ast.Store):sub[n.id]='local-assignment'
                statements(node.body,sub,copy.deepcopy({name:value for name,value in parsers.items() if sub.get(name)==env.get(name)}),scope+'.'+node.name)
                continue
            inspect(node,env,parsers,scope)
            if isinstance(node,(ast.Assign,ast.AnnAssign)):
                vals=node.targets if isinstance(node,ast.Assign) else [node.target]
                value=node.value
                parser_alias=isinstance(value,ast.Name) and value.id in parsers
                parser_constructor=isinstance(value,ast.Call) and qualified(value.func,env) in ('argparse.ArgumentParser',)
                parser_sub=isinstance(value,ast.Call) and isinstance(value.func,ast.Attribute) and value.func.attr in ('add_subparsers','add_parser') and receiver_config(value,env,parsers,scope) is not None
                alias=qualified(value,env) if value is not None else None
                if value is not None and argv_nodes(value,env) and isinstance(value,(ast.Name,ast.Attribute,ast.Subscript,ast.Compare,ast.BoolOp,ast.IfExp)):
                    alias='cli.argv-array' if qualified(value,env) in ('sys.argv','cli.argv-array') or isinstance(value,ast.Subscript) and isinstance(value.slice,ast.Slice) else 'cli.argv-value'
                config={}
                if parser_constructor or parser_sub:
                    config=receiver_config(value,env,parsers,scope)
                elif parser_alias:config=parsers[value.id]
                if isinstance(node,ast.Assign):
                    for target in node.targets:
                        if isinstance(target,ast.Attribute) and isinstance(target.value,ast.Name) and target.value.id in parsers:
                            current=parsers[target.value.id];current['overrides']={**current.get('overrides',{}),target.attr:site(value)};parsers[target.value.id]=current
                for target in vals:
                    for name in targets(target):
                        env[name]=alias or 'local-assignment'
                        if (parser_constructor or parser_sub or parser_alias) and config is not None:
                            parsers[name]=config
                            env[name]='argparse-parser-instance'
                        else:parsers.pop(name,None)
            for field in ('body','orelse','finalbody'):
                child=getattr(node,field,None)
                if isinstance(child,list) and child:statements(child,env,parsers,scope)
            if isinstance(node,ast.Try):
                for handler in node.handlers:statements(handler.body,env,parsers,scope)
    statements(tree.body,{},{},'<module>')
    result['exits'].append({'kind':'python-module-normal-completion-policy','policy':'Normal module completion returns to the Python launcher. Actual sys.exit, raised exceptions, handlers, finally blocks and child status checks remain separate source-bound edges; no blanket numeric status.'})
    result['sourceBindings']=[{'kind':'static-whole-source','utf8Bytes':len(text.encode('utf-8')),'sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),'parser':'python-stdlib-ast','execution':False}]
    result['unresolved'].append({'rule':'facts-require-caller-and-branch-composition','detail':'Static declarations/accesses are not whole supported command completeness or runtime effective defaults; argparse implicit help/error behavior must be composed from receiver contract, not invented literal source.'})
    return result

def main():
    qualify_selected_argparse_prerequisite()
    request=json.load(sys.stdin)
    json.dump({'sources':[extract_source(x) for x in request['sources']]},sys.stdout,ensure_ascii=False)
if __name__=='__main__':main()
