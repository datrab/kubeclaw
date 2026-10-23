/** Selected query policy. No file, task, ENV, current-profile or schema defaults. */
export interface CorpusRankingPolicy {
  readonly schemaVersion: 'corpus-ranking.v1';
  readonly candidateFloor: number;
  readonly candidateMultiplier: number;
  readonly rrfDamping: number;
}
export function captureCorpusRanking(value: CorpusRankingPolicy): CorpusRankingPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'candidateFloor,candidateMultiplier,rrfDamping,schemaVersion'
    || value.schemaVersion !== 'corpus-ranking.v1'
    || [value.candidateFloor, value.candidateMultiplier, value.rrfDamping]
      .some(number => !Number.isSafeInteger(number) || number < 1 || number > 2147483647)) {
    throw new Error('CORPUS_RANKING_INVALID');
  }
  return Object.freeze({ ...value });
}
