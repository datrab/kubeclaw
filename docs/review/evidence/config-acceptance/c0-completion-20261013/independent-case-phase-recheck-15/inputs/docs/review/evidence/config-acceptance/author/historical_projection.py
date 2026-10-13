"""One-to-many inactive history projection, not active case/field acceptance."""
from historical_mapping import require


def historical_reference(package, cid, history):
    return {'packageId': package['id'], 'sourcePath': package['sourcePath'],
            'sourceSha256': package['sourceSha256'], 'nativeCaseId': cid,
            'historicalCaseCanonicalSha256': history['historicalCaseCanonicalSha256'],
            'mapPath': history['historicalMappingReview']['mapPath'],
            'mapSha256': history['historicalMappingReview']['mapSha256'],
            'scope': 'inactive historical predecessor only; not operative case specification',
            'countsTowardAcceptance': False}


def counts(package):
    links = package['canonicalCaseMapping']
    return {'unlinkedNativeCaseCount': sum(link['canonicalCaseId'] is None for link in links),
            'historicallyMappedNativeCaseCount': sum('historicalMapping' in link for link in links),
            'unresolvedNativeCaseCount': sum(link['canonicalCaseId'] is None and
                                           'historicalMapping' not in link for link in links)}


def attach(package, canonical_cases, histories):
    """Attach reviewed inactive links; retain all original native bodies/requirements."""
    by_id = {case['id']: case for case in canonical_cases}
    links = {link['nativeCaseId']: link for link in package['canonicalCaseMapping']}
    require(set(histories) <= set(links), 'projection missing historical native ID')
    for cid, history in histories.items():
        require(links[cid]['canonicalCaseId'] is None and cid not in by_id,
                'projection reactivates predecessor: ' + cid)
        links[cid]['historicalMapping'] = history
        for successor in history['activeCanonicalSuccessors']:
            sid = successor['caseId']
            require(sid in by_id, 'projection dangling successor: ' + sid)
            by_id[sid].setdefault('historicalSpecificationReferences', []).append(
                historical_reference(package, cid, history))
    return counts(package)


def verify(package, canonical_cases, histories, advertisement):
    """Check complete history set, exact forward links and all reverse references."""
    by_id = {case['id']: case for case in canonical_cases}
    links = {link['nativeCaseId']: link for link in package['canonicalCaseMapping']}
    require(len(links) == len(package['canonicalCaseMapping']), 'projection duplicate native link')
    actual = {cid for cid, link in links.items() if 'historicalMapping' in link}
    require(actual == set(histories), 'projection historical set omission/addition')
    for cid, history in histories.items():
        require(links[cid]['canonicalCaseId'] is None and cid not in by_id,
                'projection reactivates predecessor: ' + cid)
        require(links[cid]['historicalMapping'] == history, 'projection reviewed mapping drift: ' + cid)
        expected = historical_reference(package, cid, history)
        for successor in history['activeCanonicalSuccessors']:
            sid = successor['caseId']
            require(sid in by_id, 'projection dangling successor: ' + sid)
            refs = by_id[sid].get('historicalSpecificationReferences', [])
            selected = [ref for ref in refs if ref.get('packageId') == package['id'] and
                        ref.get('nativeCaseId') == cid]
            require(selected == [expected], 'projection missing/duplicate/changed reverse link: ' + cid)
    for case in canonical_cases:
        for ref in case.get('historicalSpecificationReferences', []):
            require(ref.get('packageId') == package['id'], 'projection unknown historical package')
            cid = ref.get('nativeCaseId')
            require(cid in histories, 'projection unknown historical predecessor')
            history = histories[cid]
            require(case['id'] in {s['caseId'] for s in history['activeCanonicalSuccessors']} and
                    ref == historical_reference(package, cid, history),
                    'projection reverse reference identity/binding drift: ' + cid)
    for key, value in counts(package).items():
        require(advertisement.get(key) == value, 'projection advertised count drift: ' + key)
