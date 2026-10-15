"""Owned finite documentation AST receipt protocol; not an execution engine.

Version 1 preserves the reviewed sparse dump-shaped receipt representation.
Only declared optional empty lists are omitted. Locations are not receipts.
Unknown syntax/fields are rejected with the actual source identity.
"""
import ast
import sys
import json
from pathlib import Path
VERSION = 'docs-python-ast-v1'
SCHEMA = {'mod': [],
 'Module': ['body', 'type_ignores'],
 'Interactive': ['body'],
 'Expression': ['body'],
 'FunctionType': ['argtypes', 'returns'],
 'stmt': [],
 'FunctionDef': ['name', 'args', 'body', 'decorator_list', 'returns', 'type_comment'],
 'AsyncFunctionDef': ['name', 'args', 'body', 'decorator_list', 'returns', 'type_comment'],
 'ClassDef': ['name', 'bases', 'keywords', 'body', 'decorator_list'],
 'Return': ['value'],
 'Delete': ['targets'],
 'Assign': ['targets', 'value', 'type_comment'],
 'AugAssign': ['target', 'op', 'value'],
 'AnnAssign': ['target', 'annotation', 'value', 'simple'],
 'For': ['target', 'iter', 'body', 'orelse', 'type_comment'],
 'AsyncFor': ['target', 'iter', 'body', 'orelse', 'type_comment'],
 'While': ['test', 'body', 'orelse'],
 'If': ['test', 'body', 'orelse'],
 'With': ['items', 'body', 'type_comment'],
 'AsyncWith': ['items', 'body', 'type_comment'],
 'Match': ['subject', 'cases'],
 'Raise': ['exc', 'cause'],
 'Try': ['body', 'handlers', 'orelse', 'finalbody'],
 'TryStar': ['body', 'handlers', 'orelse', 'finalbody'],
 'Assert': ['test', 'msg'],
 'Import': ['names'],
 'ImportFrom': ['module', 'names', 'level'],
 'Global': ['names'],
 'Nonlocal': ['names'],
 'Expr': ['value'],
 'Pass': [],
 'Break': [],
 'Continue': [],
 'expr': [],
 'BoolOp': ['op', 'values'],
 'NamedExpr': ['target', 'value'],
 'BinOp': ['left', 'op', 'right'],
 'UnaryOp': ['op', 'operand'],
 'Lambda': ['args', 'body'],
 'IfExp': ['test', 'body', 'orelse'],
 'Dict': ['keys', 'values'],
 'Set': ['elts'],
 'ListComp': ['elt', 'generators'],
 'SetComp': ['elt', 'generators'],
 'DictComp': ['key', 'value', 'generators'],
 'GeneratorExp': ['elt', 'generators'],
 'Await': ['value'],
 'Yield': ['value'],
 'YieldFrom': ['value'],
 'Compare': ['left', 'ops', 'comparators'],
 'Call': ['func', 'args', 'keywords'],
 'FormattedValue': ['value', 'conversion', 'format_spec'],
 'JoinedStr': ['values'],
 'Constant': ['value', 'kind'],
 'Attribute': ['value', 'attr', 'ctx'],
 'Subscript': ['value', 'slice', 'ctx'],
 'Starred': ['value', 'ctx'],
 'Name': ['id', 'ctx'],
 'List': ['elts', 'ctx'],
 'Tuple': ['elts', 'ctx'],
 'Slice': ['lower', 'upper', 'step'],
 'expr_context': [],
 'Load': [],
 'Store': [],
 'Del': [],
 'boolop': [],
 'And': [],
 'Or': [],
 'operator': [],
 'Add': [],
 'Sub': [],
 'Mult': [],
 'MatMult': [],
 'Div': [],
 'Mod': [],
 'Pow': [],
 'LShift': [],
 'RShift': [],
 'BitOr': [],
 'BitXor': [],
 'BitAnd': [],
 'FloorDiv': [],
 'unaryop': [],
 'Invert': [],
 'Not': [],
 'UAdd': [],
 'USub': [],
 'cmpop': [],
 'Eq': [],
 'NotEq': [],
 'Lt': [],
 'LtE': [],
 'Gt': [],
 'GtE': [],
 'Is': [],
 'IsNot': [],
 'In': [],
 'NotIn': [],
 'comprehension': ['target', 'iter', 'ifs', 'is_async'],
 'excepthandler': [],
 'ExceptHandler': ['type', 'name', 'body'],
 'arguments': ['posonlyargs', 'args', 'vararg', 'kwonlyargs', 'kw_defaults', 'kwarg', 'defaults'],
 'arg': ['arg', 'annotation', 'type_comment'],
 'keyword': ['arg', 'value'],
 'alias': ['name', 'asname'],
 'withitem': ['context_expr', 'optional_vars'],
 'match_case': ['pattern', 'guard', 'body'],
 'pattern': [],
 'MatchValue': ['value'],
 'MatchSingleton': ['value'],
 'MatchSequence': ['patterns'],
 'MatchMapping': ['keys', 'patterns', 'rest'],
 'MatchClass': ['cls', 'patterns', 'kwd_attrs', 'kwd_patterns'],
 'MatchStar': ['name'],
 'MatchAs': ['pattern', 'name'],
 'MatchOr': ['patterns'],
 'type_ignore': [],
 'TypeIgnore': ['lineno', 'tag'],
 'slice': []}
# Reviewed representation-only optional lists. Required scalars/None and
# nonempty values are always retained, including dict-unpacking placeholders.
OPTIONAL_LISTS = {
 'Module': {'body', 'type_ignores'}, 'Interactive': {'body'},
 'FunctionDef': {'body', 'decorator_list', 'type_params'},
 'AsyncFunctionDef': {'body', 'decorator_list', 'type_params'},
 'ClassDef': {'bases', 'keywords', 'body', 'decorator_list', 'type_params'},
 'arguments': {'posonlyargs', 'args', 'kwonlyargs', 'kw_defaults', 'defaults'},
 'Call': {'args', 'keywords'}, 'If': {'body', 'orelse'},
 'For': {'body', 'orelse'}, 'AsyncFor': {'body', 'orelse'},
 'While': {'body', 'orelse'}, 'Try': {'body', 'handlers', 'orelse', 'finalbody'},
 'TryStar': {'body', 'handlers', 'orelse', 'finalbody'},
 'With': {'items', 'body'}, 'AsyncWith': {'items', 'body'},
 'ExceptHandler': {'body'}, 'List': {'elts'}, 'Tuple': {'elts'},
 'Set': {'elts'}, 'Dict': {'keys', 'values'}, 'comprehension': {'ifs'},
 'ListComp': {'generators'}, 'SetComp': {'generators'},
 'DictComp': {'generators'}, 'GeneratorExp': {'generators'},
 'Import': {'names'}, 'ImportFrom': {'names'}, 'Global': {'names'},
 'Nonlocal': {'names'}, 'Assign': {'targets'}, 'Delete': {'targets'},
 'BoolOp': {'values'}, 'Compare': {'ops', 'comparators'},
 'JoinedStr': {'values'}, 'Match': {'cases'}, 'match_case': {'body'},
 'MatchSequence': {'patterns'}, 'MatchMapping': {'keys', 'patterns'},
 'MatchClass': {'patterns', 'kwd_attrs', 'kwd_patterns'}, 'MatchOr': {'patterns'},
}
for _name in ('FunctionDef', 'AsyncFunctionDef', 'ClassDef'):
    SCHEMA[_name] = SCHEMA[_name] + ['type_params']

# Legacy optional scalar absence; list None placeholders and Constant.value
# are NOT optional and always survive. This is not cross-version normalization.
OPTIONAL_NONE = {'FunctionDef': ['returns', 'type_comment'],
 'AsyncFunctionDef': ['returns', 'type_comment'],
 'Return': ['value'],
 'Assign': ['type_comment'],
 'AnnAssign': ['value'],
 'For': ['type_comment'],
 'AsyncFor': ['type_comment'],
 'With': ['type_comment'],
 'AsyncWith': ['type_comment'],
 'Raise': ['exc', 'cause'],
 'Assert': ['msg'],
 'ImportFrom': ['module', 'level'],
 'Yield': ['value'],
 'FormattedValue': ['format_spec'],
 'Constant': ['kind'],
 'Slice': ['lower', 'upper', 'step'],
 'ExceptHandler': ['type', 'name'],
 'arguments': ['vararg', 'kwarg'],
 'arg': ['annotation', 'type_comment'],
 'keyword': ['arg'],
 'alias': ['asname'],
 'withitem': ['optional_vars'],
 'match_case': ['guard'],
 'MatchMapping': ['rest'],
 'MatchStar': ['name'],
 'MatchAs': ['pattern', 'name'],
 'NameConstant': ['kind']}

def serialize(node, source_identity='<source>'):
    def fail(message):
        raise ValueError('API_PRODUCT_PYTHON_AST_UNQUALIFIED: ' + str(source_identity) + ': ' + message)
    def emit(value):
        if isinstance(value, ast.AST):
            kind = type(value).__name__
            fields = SCHEMA.get(kind)
            if fields is None: fail('unknown node ' + kind)
            if any(field not in fields for field in value._fields):
                fail('unknown field on ' + kind + ': ' + repr(value._fields))
            # _attributes are intentionally excluded, as in existing receipts.
            extra = set(vars(value)) - set(fields) - set(value._attributes)
            if extra: fail('unknown instance field on ' + kind + ': ' + repr(sorted(extra)))
            items = []
            for field in fields:
                if not hasattr(value, field):
                    if field == 'type_params': continue # reviewed nongeneric pre-3.12 representation
                    fail('missing field ' + kind + '.' + field)
                child = getattr(value, field)
                if child is None and field in OPTIONAL_NONE.get(kind, ()): continue
                if isinstance(child, list) and not child:
                    if field not in OPTIONAL_LISTS.get(kind, set()):
                        fail('unreviewed empty list ' + kind + '.' + field)
                    continue
                items.append(field + '=' + emit(child))
            return kind + '(' + ', '.join(items) + ')'
        if isinstance(value, list): return '[' + ', '.join(emit(item) for item in value) + ']'
        if value is None or type(value) in (str, int, float, bool, bytes, complex): return repr(value)
        if value is Ellipsis: return 'Ellipsis'
        fail('unsupported scalar ' + type(value).__name__)
    return emit(node)

def documentation_custody(tree, source_identity):
    # Module validation also preserves/rejects any non-statement module fields;
    # statements remain separate declaration/initialization purpose receipts.
    serialize(tree, source_identity)
    operations = []
    for statement in tree.body:
        kind = type(statement).__name__
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            symbol = statement.name
        elif isinstance(statement, (ast.Import, ast.ImportFrom)):
            symbol = ','.join((statement.module + '.' if isinstance(statement, ast.ImportFrom) and statement.module else '') + item.name + (' as ' + item.asname if item.asname else '') for item in statement.names)
        elif isinstance(statement, (ast.Assign, ast.AnnAssign)):
            targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
            symbol = ','.join(serialize(target, source_identity) for target in targets)
        else:
            symbol = '<module-operation>'
        operations.append({'kind': kind, 'symbol': symbol, 'syntax': serialize(statement, source_identity)})
    for item in tree.type_ignores:
        operations.append({'kind': 'TypeIgnore', 'symbol': '<module-type-ignore>', 'syntax': serialize(item, source_identity)})
    return {'protocol': VERSION, 'operations': operations}

if __name__ == '__main__':
    mode = sys.argv[1]
    custody = mode in ('--documentation-custody', '--stdin-custody')
    if mode in ('--stdin', '--stdin-custody'):
        source = sys.argv[2]
        tree = ast.parse(sys.stdin.read(), filename=source)
    else:
        source = sys.argv[2] if custody else sys.argv[1]
        if len(sys.argv) == 4 and sys.argv[2] == '--expression':
            tree = ast.parse(sys.argv[3], mode='eval').body
        else:
            tree = ast.parse(Path(source).read_text(), filename=source)
    print(json.dumps(documentation_custody(tree, source) if custody else serialize(tree, source)))
