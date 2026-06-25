// The reviewer side of the flywheel: approve, deny, and apply.
//
// Two loops, both human-gated:
//   - Per-word corrections: approve, then apply. Applying writes the approved
//     level into the vocabulary store, which is what analysis reads from. The
//     change is durable and shows up for every later analysis.
//   - Full-analysis corrections: approve, which invalidates the many-shot cache.
//     The approved example then steers the model on the next call. No write to the
//     vocabulary store; the influence is through context, not stored levels.

import type { CorrectionQueue } from './corrections';
import type { ManyShotCache } from './manyshot';
import type { VocabularyStore } from '../vocab-store';

export function approveWordCorrection(queue: CorrectionQueue, id: string): void {
  const record = queue.findWord(id);
  if (!record) throw new Error(`No word correction with id ${id}`);
  if (record.status !== 'pending') throw new Error(`Correction ${id} is not pending`);
  record.status = 'approved';
}

export function denyWordCorrection(queue: CorrectionQueue, id: string): void {
  const record = queue.findWord(id);
  if (!record) throw new Error(`No word correction with id ${id}`);
  record.status = 'denied';
}

// Writes every approved-but-not-yet-applied word correction into the store and
// marks it applied. Returns the number applied. This is the step that actually
// changes the database the analysis pipeline reads from.
export function applyApprovedWordCorrections(queue: CorrectionQueue, store: VocabularyStore): number {
  let applied = 0;
  for (const record of queue.wordCorrections('approved')) {
    store.upsert(record.term, record.suggestedLevel, record.pos);
    record.status = 'applied';
    applied += 1;
  }
  return applied;
}

export function approveAnalysisCorrection(
  queue: CorrectionQueue,
  id: string,
  manyShot: ManyShotCache,
): void {
  const record = queue.findAnalysis(id);
  if (!record) throw new Error(`No analysis correction with id ${id}`);
  if (record.status !== 'pending') throw new Error(`Correction ${id} is not pending`);
  record.status = 'approved';
  // Invalidate so the next analysis rebuilds its many-shot context with this
  // example included.
  manyShot.invalidate();
}

export function denyAnalysisCorrection(queue: CorrectionQueue, id: string): void {
  const record = queue.findAnalysis(id);
  if (!record) throw new Error(`No analysis correction with id ${id}`);
  record.status = 'denied';
}
