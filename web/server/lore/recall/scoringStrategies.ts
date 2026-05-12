import { dedupeTerms } from '../core/utils';
import type { ScoringCandidate, ScoredResult, ScoringConfig } from './recallScoring';

export const DEFAULT_STRATEGY = 'raw_plus_lex_damp' as const;
export type StrategyName = typeof DEFAULT_STRATEGY;

export function computeRecencyBonus(item: ScoringCandidate, config: ScoringConfig): number {
  if (!config.recency_enabled) return 0;
  if (!item.updated_at) return 0;
  const maxBonus = config.recency_max_bonus || 0;
  if (!maxBonus) return 0;
  if (item.priority <= (config.recency_priority_exempt ?? 1)) return maxBonus;
  const ageDays = Math.max(0, (Date.now() - item.updated_at.getTime()) / 86_400_000);
  const halfLife = config.recency_half_life_days || 180;
  return maxBonus * Math.pow(2, -ageDays / halfLife);
}

export function getRecencyInfo(item: ScoringCandidate, recencyBonus: number) {
  if (!item.updated_at) return null;
  const ageDays = Math.max(0, (Date.now() - item.updated_at.getTime()) / 86_400_000);
  return { recency_bonus: round(recencyBonus), memory_age_days: round(ageDays) };
}

export function round(n: number): number {
  return Number(n.toFixed(6));
}

export function sortResults(items: ScoredResult[]): ScoredResult[] {
  return items.sort((a, b) => b.score - a.score || a.priority - b.priority || a.uri.localeCompare(b.uri));
}

export function formatResult(
  item: ScoringCandidate,
  score: number,
  breakdown: Record<string, number | string>,
  recencyBonus = 0,
): ScoredResult {
  const recencyInfo = getRecencyInfo(item, recencyBonus);
  return {
    uri: item.uri,
    score: Number(score.toFixed(6)),
    exact_score: Number(item.exact_score.toFixed(6)),
    glossary_semantic_score: Number(item.glossary_semantic_score.toFixed(6)),
    dense_score: Number(item.dense_score.toFixed(6)),
    lexical_score: Number(item.lexical_score.toFixed(6)),
    score_breakdown: {
      ...breakdown,
      ...(recencyBonus ? { recency: round(recencyBonus) } : {}),
    },
    cues: dedupeTerms([...item.cues], 3),
    matched_on: Array.from(item.matched_on).toSorted(),
    priority: item.priority,
    ...(recencyInfo ? { memory_age_days: recencyInfo.memory_age_days, recency_bonus: recencyInfo.recency_bonus } : {}),
  };
}

export function scoreRawPlusLexDamp(byUri: Map<string, ScoringCandidate>, config: ScoringConfig): ScoredResult[] {
  const {
    w_exact,
    w_glossary_semantic,
    w_dense,
    w_lexical,
    priority_base,
    priority_step,
    multi_view_step,
    multi_view_cap,
    query_tokens = 5,
  } = config;
  const lengthDamp = 1 / Math.log2(2 + Math.max(1, query_tokens));

  return sortResults([...byUri.values()].map((item) => {
    const multiViewBonus = Math.min(multi_view_cap, Math.max(0, item.view_types.size - 1) * multi_view_step);
    const priorityBonus = Math.max(0, priority_base - item.priority * priority_step);
    const lexContribution = item.lexical_score * lengthDamp * w_lexical;
    const recencyBonus = computeRecencyBonus(item, config);
    const score = item.exact_score * w_exact
      + item.glossary_semantic_score * w_glossary_semantic
      + item.dense_score * w_dense
      + lexContribution
      + item.view_bonus
      + priorityBonus
      + multiViewBonus
      + recencyBonus;
    return formatResult(item, score, {
      exact: round(item.exact_score * w_exact),
      glossary_semantic: round(item.glossary_semantic_score * w_glossary_semantic),
      semantic: round(item.dense_score * w_dense),
      lexical: round(lexContribution),
      lexical_damp: round(lengthDamp),
      view: round(item.view_bonus),
      priority: round(priorityBonus),
      multi_view: round(multiViewBonus),
    }, recencyBonus);
  }));
}
