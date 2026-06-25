// Turning database entries into per-token levels, and aggregating those into an
// overall assessment. The model is not involved here. That is the point.

import type { CefrLevel, LeveledToken, LevelDistribution, VocabularyEntry } from './types';
import { CEFR_ORDER } from './types';

// Pick the level for a known word. With a part-of-speech hint and a matching
// sense, use that sense (so "run" as a noun reads B2 even though the headline is
// A1). Otherwise fall back to the headline level.
export function levelForEntry(
  entry: VocabularyEntry,
  posHint?: string,
): { level: CefrLevel; pos?: string } {
  if (posHint) {
    const sense = entry.entries.find((e) => e.pos === posHint);
    if (sense) return { level: sense.level, pos: sense.pos };
  }
  return { level: entry.cefrLevel };
}

export function distribution(tokens: LeveledToken[]): LevelDistribution {
  const counts = emptyCounts();
  for (const token of tokens) counts[token.level] += 1;
  return { counts, assessedLevel: modal(counts) };
}

// The most common content level. Ties resolve to the easier level, which keeps the
// assessment stable and is the conservative choice for a teaching tool.
function modal(counts: Record<CefrLevel, number>): CefrLevel {
  let best: CefrLevel = 'A1';
  let bestCount = -1;
  for (const level of CEFR_ORDER) {
    if (counts[level] > bestCount) {
      bestCount = counts[level];
      best = level;
    }
  }
  return best;
}

function emptyCounts(): Record<CefrLevel, number> {
  return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
}
