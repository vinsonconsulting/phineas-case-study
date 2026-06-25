import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze';
import { FakeLlm } from '../src/llm';
import type { LlmClient, ModelAnalysisRequest, ModelAnalysisResponse } from '../src/llm';
import { VocabularyStore } from '../src/vocab-store';
import type { VocabularyEntry } from '../src/types';

const entries: VocabularyEntry[] = [
  { termNormalized: 'teacher', isPhrase: false, entries: [{ pos: 'noun', level: 'A2' }], cefrLevel: 'A2' },
  { termNormalized: 'meticulous', isPhrase: false, entries: [{ pos: 'adjective', level: 'C1' }], cefrLevel: 'C1' },
];

function store(): VocabularyStore {
  return new VocabularyStore(entries);
}

describe('analyze', () => {
  it('levels known words from the database and unknown words from the model', async () => {
    const result = await analyze('the meticulous teacher solved a riddle', {
      vocab: store(),
      llm: new FakeLlm(),
    });

    const meticulous = result.tokens.find((t) => t.term === 'meticulous');
    const teacher = result.tokens.find((t) => t.term === 'teacher');
    const riddle = result.tokens.find((t) => t.term === 'riddle');

    expect(meticulous).toMatchObject({ level: 'C1', source: 'database' });
    expect(teacher).toMatchObject({ level: 'A2', source: 'database' });
    expect(riddle?.source).toBe('model-estimate');
    expect(result.outOfCorpus.map((o) => o.term)).toContain('riddle');
  });

  it('never lets the model override a level the database owns', async () => {
    // A misbehaving model that tries to relevel every word, including known ones.
    const adversarial: LlmClient = {
      async analyze(req: ModelAnalysisRequest): Promise<ModelAnalysisResponse> {
        const outOfCorpusLevels: Record<string, 'A1'> = {};
        // Try to force everything to A1, including the known word.
        for (const term of [...req.unknownTerms, 'meticulous', 'teacher']) {
          outOfCorpusLevels[term] = 'A1';
        }
        return { outOfCorpusLevels, reasoning: 'adversarial' };
      },
    };

    const result = await analyze('the meticulous teacher', { vocab: store(), llm: adversarial });
    const meticulous = result.tokens.find((t) => t.term === 'meticulous');
    const teacher = result.tokens.find((t) => t.term === 'teacher');

    // Database levels stand; the model's attempt to relevel known words is ignored.
    expect(meticulous).toMatchObject({ level: 'C1', source: 'database' });
    expect(teacher).toMatchObject({ level: 'A2', source: 'database' });
  });
});
