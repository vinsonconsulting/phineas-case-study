// The analysis pipeline.
//
// The production app streams this as a sequence of discrete stages over SSE (auth,
// quota, validate, extract, vocab, then several model sub-steps, then parse and
// log). The ordering that matters for correctness is preserved here: the database
// lookup happens before the model is called, and the merge step lets the database
// win for every word it knows. The model fills gaps; it never overrides.

import type { AnalysisResult, LeveledToken, VocabularyEntry } from './types';
import type { LlmClient, ManyShotExample } from './llm';
import type { VocabularyStore } from './vocab-store';
import { tokenize } from './tokenize';
import { distribution, levelForEntry } from './leveling';

export interface AnalyzeDeps {
  vocab: VocabularyStore;
  llm: LlmClient;
  manyShot?: ManyShotExample[];
  // Optional token -> part-of-speech hints, to exercise POS-aware leveling.
  posHints?: Record<string, string>;
}

// The ordered stages, named to mirror the production pipeline's discrete steps.
export const ANALYZE_STAGES = ['extract', 'vocab', 'assess', 'merge', 'distribution'] as const;

export async function analyze(text: string, deps: AnalyzeDeps): Promise<AnalysisResult> {
  // 1. extract: tokenize into candidate content terms (order and repeats kept).
  const terms = tokenize(text);

  // 2. vocab: resolve known levels FROM the database, before any model call.
  const hits = deps.vocab.lookup(terms);
  const knownSummary = summarize(hits);
  const unknownTerms = dedupe(terms.filter((t) => !hits.has(t.toLowerCase())));

  // 3. assess: the model estimates levels for unknown words and writes the
  //    rationale. Known words are not in its request at all.
  const model = await deps.llm.analyze({
    text,
    unknownTerms,
    knownSummary,
    manyShot: deps.manyShot ?? [],
  });

  // 4. merge: database levels win for known words; model estimates fill the gaps.
  const tokens: LeveledToken[] = [];
  for (const term of terms) {
    const norm = term.toLowerCase();
    const entry = hits.get(norm);
    if (entry) {
      const { level, pos } = levelForEntry(entry, deps.posHints?.[norm]);
      tokens.push({ term, level, pos, source: 'database', isPhrase: entry.isPhrase });
      continue;
    }
    const estimated = model.outOfCorpusLevels[term] ?? model.outOfCorpusLevels[norm];
    if (estimated) {
      tokens.push({ term, level: estimated, source: 'model-estimate', isPhrase: false });
    }
  }

  // 5. distribution: the modal content level becomes the headline assessment.
  const dist = distribution(tokens);

  const outOfCorpus = dedupeByTerm(
    tokens
      .filter((t) => t.source === 'model-estimate')
      .map((t) => ({ term: t.term, level: t.level })),
  );

  return {
    assessedLevel: dist.assessedLevel,
    tokens,
    distribution: dist,
    outOfCorpus,
    reasoning: model.reasoning,
  };
}

function summarize(hits: Map<string, VocabularyEntry>): string {
  if (hits.size === 0) return '(no database matches)';
  const parts: string[] = [];
  for (const [term, entry] of [...hits.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (entry.entries.length > 1) {
      const senses = entry.entries.map((s) => `${s.pos}: ${s.level}`).join(', ');
      parts.push(`'${term}' (${senses})`);
    } else {
      parts.push(`'${term}': ${entry.cefrLevel}`);
    }
  }
  return parts.join('; ');
}

function dedupe(terms: string[]): string[] {
  return [...new Set(terms.map((t) => t.toLowerCase()))];
}

function dedupeByTerm(items: Array<{ term: string; level: AnalysisResult['assessedLevel'] }>) {
  const seen = new Set<string>();
  const out: typeof items = [];
  for (const item of items) {
    const key = item.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
