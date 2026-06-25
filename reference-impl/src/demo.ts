// End-to-end walkthrough of the data flywheel, on synthetic data, runnable with
// `npm run demo`. It analyzes one sentence, then shows the two correction loops
// changing the result:
//
//   1. Per-word loop: a trainer corrects "meticulous" from C1 to B2. After an
//      admin approves and applies it, the level comes from the database.
//   2. Many-shot loop: a trainer's approved analysis correction endorses
//      "kerfuffle" as B2, steering the model's estimate on the next call.
//
// Nothing here calls a real model or backend. The model is the deterministic
// FakeLlm; the database is an in-memory store seeded from the fixtures.

import { analyze } from './analyze';
import { FakeLlm } from './llm';
import { VocabularyStore } from './vocab-store';
import { CorrectionQueue } from './flywheel/corrections';
import { ManyShotCache } from './flywheel/manyshot';
import {
  applyApprovedWordCorrections,
  approveAnalysisCorrection,
  approveWordCorrection,
} from './flywheel/review';
import { loadTrainingExamplesFixture } from './fixtures';
import type { AnalysisResult } from './types';

const SENTENCE =
  'The diligent teacher gave a meticulous lesson, but the kerfuffle was a genuine nuisance.';

function levelOf(result: AnalysisResult, word: string): string {
  const token = result.tokens.find((t) => t.term.toLowerCase() === word);
  return token ? `${token.level} (from ${token.source})` : 'not leveled';
}

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(28)} ${value}`);
}

async function main(): Promise<void> {
  const vocab = VocabularyStore.fromFixture();
  const llm = new FakeLlm();
  const queue = new CorrectionQueue();
  const manyShot = new ManyShotCache();

  // A backlog of trainer submissions exists but is unreviewed, so it has no effect.
  for (const example of loadTrainingExamplesFixture()) {
    queue.submitAnalysisCorrection({ ...example, submittedBy: 'trainer-2' });
  }

  console.log('\nText under analysis:');
  console.log(`  "${SENTENCE}"\n`);

  // --- Baseline ---
  const before = await analyze(SENTENCE, { vocab, llm, manyShot: manyShot.get(queue) });
  console.log('1. Baseline analysis (no approved corrections in effect)');
  line('assessed level:', before.assessedLevel);
  line('meticulous:', levelOf(before, 'meticulous'));
  line('kerfuffle:', levelOf(before, 'kerfuffle'));

  // --- Per-word loop ---
  const correction = queue.submitWordCorrection({
    term: 'meticulous',
    currentLevel: 'C1',
    suggestedLevel: 'B2',
    submittedBy: 'trainer-1',
    reason: 'Common in these learners coursebooks; C1 overstates it.',
  });
  console.log('\n2. A trainer submits a per-word correction: meticulous C1 -> B2');
  line('status:', correction.status);

  approveWordCorrection(queue, correction.id);
  const appliedCount = applyApprovedWordCorrections(queue, vocab);
  console.log(`   Admin approves and applies it (${appliedCount} correction applied).`);

  const afterWord = await analyze(SENTENCE, { vocab, llm, manyShot: manyShot.get(queue) });
  line('meticulous now:', levelOf(afterWord, 'meticulous'));
  line('assessed level now:', afterWord.assessedLevel);

  // --- Many-shot loop ---
  const pending = queue.analysisCorrections('pending');
  const kerfuffleExample = pending.find((c) => 'kerfuffle' in c.correctedLevelHints);
  if (!kerfuffleExample) throw new Error('expected a pending kerfuffle example in the fixture');

  console.log('\n3. An admin approves a full-analysis correction endorsing kerfuffle as B2');
  approveAnalysisCorrection(queue, kerfuffleExample.id, manyShot);
  console.log('   Approval invalidates the many-shot cache, so the next call rebuilds it.');

  const afterManyShot = await analyze(SENTENCE, { vocab, llm, manyShot: manyShot.get(queue) });
  line('kerfuffle now:', levelOf(afterManyShot, 'kerfuffle'));
  line('assessed level now:', afterManyShot.assessedLevel);

  console.log('\nSummary');
  line('meticulous:', `${levelOf(before, 'meticulous')}  ->  ${levelOf(afterManyShot, 'meticulous')}`);
  line('kerfuffle:', `${levelOf(before, 'kerfuffle')}  ->  ${levelOf(afterManyShot, 'kerfuffle')}`);
  line('assessed level:', `${before.assessedLevel}  ->  ${afterManyShot.assessedLevel}`);
  console.log('');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
