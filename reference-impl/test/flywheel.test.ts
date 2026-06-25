// The flywheel, made verifiable. These tests are the point of the repo: a trainer
// correction, once approved, changes the next analysis, and approval is required
// for it to count.

import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze';
import { FakeLlm } from '../src/llm';
import { VocabularyStore } from '../src/vocab-store';
import { CorrectionQueue } from '../src/flywheel/corrections';
import { ManyShotCache } from '../src/flywheel/manyshot';
import {
  applyApprovedWordCorrections,
  approveAnalysisCorrection,
  approveWordCorrection,
} from '../src/flywheel/review';
import type { VocabularyEntry } from '../src/types';

function freshStore(): VocabularyStore {
  const entries: VocabularyEntry[] = [
    { termNormalized: 'meticulous', isPhrase: false, entries: [{ pos: 'adjective', level: 'C1' }], cefrLevel: 'C1' },
  ];
  return new VocabularyStore(entries);
}

function levelOf(tokens: Awaited<ReturnType<typeof analyze>>['tokens'], term: string) {
  return tokens.find((t) => t.term === term);
}

describe('per-word correction loop', () => {
  it('moves a level only after the correction is approved and applied', async () => {
    const vocab = freshStore();
    const llm = new FakeLlm();
    const queue = new CorrectionQueue();
    const text = 'the meticulous plan';

    const baseline = await analyze(text, { vocab, llm });
    expect(levelOf(baseline.tokens, 'meticulous')).toMatchObject({ level: 'C1', source: 'database' });

    const correction = queue.submitWordCorrection({
      term: 'meticulous',
      currentLevel: 'C1',
      suggestedLevel: 'B2',
      submittedBy: 'trainer-1',
    });

    // Submitted but not approved: the store is untouched and the level holds.
    const afterSubmit = await analyze(text, { vocab, llm });
    expect(levelOf(afterSubmit.tokens, 'meticulous')).toMatchObject({ level: 'C1' });

    // Approve, but do not apply yet: still no change to the store.
    approveWordCorrection(queue, correction.id);
    const afterApprove = await analyze(text, { vocab, llm });
    expect(levelOf(afterApprove.tokens, 'meticulous')).toMatchObject({ level: 'C1' });

    // Apply: now the database carries the corrected level.
    const applied = applyApprovedWordCorrections(queue, vocab);
    expect(applied).toBe(1);

    const afterApply = await analyze(text, { vocab, llm });
    expect(levelOf(afterApply.tokens, 'meticulous')).toMatchObject({ level: 'B2', source: 'database' });
    expect(queue.wordCorrections('applied')).toHaveLength(1);
  });
});

describe('many-shot correction loop', () => {
  it('steers an out-of-corpus estimate only after approval invalidates the cache', async () => {
    const vocab = freshStore();
    const llm = new FakeLlm();
    const queue = new CorrectionQueue();
    const manyShot = new ManyShotCache();
    const text = 'the kerfuffle continued'; // "kerfuffle" is not in the store

    const baseline = await analyze(text, { vocab, llm, manyShot: manyShot.get(queue) });
    expect(levelOf(baseline.tokens, 'kerfuffle')).toMatchObject({ level: 'C1', source: 'model-estimate' });

    // A pending correction that endorses a different level has no effect yet.
    const correction = queue.submitAnalysisCorrection({
      inputText: 'a kerfuffle broke out',
      correctedAssessedLevel: 'B1',
      correctedReasoning: 'common enough to treat as B2',
      correctedLevelHints: { kerfuffle: 'B2' },
      submittedBy: 'trainer-2',
    });

    const afterSubmit = await analyze(text, { vocab, llm, manyShot: manyShot.get(queue) });
    expect(levelOf(afterSubmit.tokens, 'kerfuffle')).toMatchObject({ level: 'C1' });
    expect(manyShot.get(queue)).toHaveLength(0);

    // Approval invalidates the cache; the example now steers the estimate.
    approveAnalysisCorrection(queue, correction.id, manyShot);
    expect(manyShot.get(queue)).toHaveLength(1);

    const afterApprove = await analyze(text, { vocab, llm, manyShot: manyShot.get(queue) });
    expect(levelOf(afterApprove.tokens, 'kerfuffle')).toMatchObject({ level: 'B2', source: 'model-estimate' });
  });
});
