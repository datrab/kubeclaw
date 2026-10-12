"""Read-only independent comparison; no fixture execution or privileged calls."""
import ast
from pathlib import Path

source = Path('tests/fixtures/test-gate/legacy-seal-guest.py')
before = Path('docs/review/evidence/buster-legacy-descendant-cases-20260921/before.py.snapshot')
additions = {'foreign-descendant', 'writable-descendant'}


class RemoveAdded(ast.NodeTransformer):
    def visit_Assign(self, node):
        if any(isinstance(target, ast.Name) and target.id == 'CASES' for target in node.targets):
            node.value.elts = [item for item in node.value.elts if item.value not in additions]
        return node

    def visit_If(self, node):
        if any(isinstance(item, ast.Constant) and isinstance(item.value, str)
               and item.value in additions for item in ast.walk(node.test)):
            return [self.visit(child) for child in node.orelse]
        return self.generic_visit(node)


original = ast.parse(before.read_text())
current = ast.parse(source.read_text())
assert ast.dump(original, include_attributes=False) == ast.dump(
    RemoveAdded().visit(current), include_attributes=False)
print('Original module AST preserved after removing only the two added case branches.')
