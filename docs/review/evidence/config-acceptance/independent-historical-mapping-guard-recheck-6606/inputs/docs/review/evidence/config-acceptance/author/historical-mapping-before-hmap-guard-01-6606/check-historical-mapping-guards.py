"""Documentation guard controls; no future behavior cases are executed."""
import copy
import json
import pathlib
from historical_mapping import MAP, load_reviewed, validate

root = pathlib.Path.cwd()
base = root/'docs/review/evidence/config-acceptance'
load = lambda path: json.loads(path.read_text())
native = load(base/'runtime/case-proposals.json')
rows = load(base/'runtime/inventory-fragment.json')['rows']
dispositions = load(base/'runtime/runtime-case-dispositions.json')['cases']
canonical_ids = {case['id'] for case in load(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
mapping = load(root/MAP)
first = mapping['records'][0]
cid = first['nativeCaseId']
sid = first['oneToManyActiveCanonicalSuccessors'][0]['caseId']
field_id = first['settings'][0]['settingId']

def positive():
    links = load_reviewed(root, native, rows, dispositions, canonical_ids)
    assert len(links) == 269
    assert all(link['countsTowardAcceptance'] is False and
               link['canonicalCaseId'] is None for link in links.values())
    print('PASS restored positive: 269 inactive historical mappings; no root edit')

def mutate_item(items, item_id, change):
    return [change(copy.deepcopy(item)) if item['id'] == item_id else item for item in items]

def set_key(key, value):
    def change(item):
        item[key] = value
        return item
    return change

def negative(label, expected, **overrides):
    args = dict(mapping=mapping, native_cases=native, rows=rows,
                dispositions=dispositions, canonical_ids=canonical_ids)
    args.update(overrides)
    try:
        validate(**args)
    except ValueError as error:
        assert expected in str(error), (label, str(error), expected)
        print('PASS intended rejection: ' + label + ' / ' + str(error))
    else:
        raise AssertionError('escaped guard: ' + label)

positive()
negative('historical body tampering', 'historical body drift',
         native_cases=mutate_item(native, cid, set_key('scope', 'changed scope')))
negative('historical requirement loss', 'historical body drift',
         native_cases=mutate_item(native, cid, set_key('requirements', [])))
negative('reactivated obsolete case', 'obsolete case reactivation/acceptance',
         canonical_ids=canonical_ids | {cid})
negative('historical acceptance promotion', 'disposition drift',
         dispositions=mutate_item(dispositions, cid, set_key('countsTowardAcceptance', True)))
negative('removed successor', 'dangling successor', canonical_ids=canonical_ids - {sid})
negative('successor body changed', 'successor material drift',
         native_cases=mutate_item(native, sid, set_key('scope', 'changed successor scope')))
negative('successor requirement loss', 'successor material drift',
         native_cases=mutate_item(native, sid, set_key('requirements', [])))
negative('successor made inactive', 'inactive successor',
         dispositions=mutate_item(dispositions, sid, set_key('disposition', 'superseded')))
negative('reviewed field changed', 'reviewed field material drift',
         rows=mutate_item(rows, field_id, set_key('cases', [])))
short_mapping = {**mapping, 'records': mapping['records'][1:]}
negative('whole historical entry omitted', 'historical record set drift', mapping=short_mapping)
duplicated = {**mapping, 'records': [mapping['records'][1], *mapping['records'][1:]]}
negative('duplicate historical entry', 'historical record set drift', mapping=duplicated)
accepted = copy.deepcopy(mapping)
accepted['records'][0]['semanticAcceptance'] = True
negative('semantic acceptance promotion', 'obsolete case reactivation/acceptance', mapping=accepted)
positive()
print('12 negative documentation guards / 2 restored positives; implementation cases not-run')
