import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt } from '../src/prompt';

describe('buildAnalysisPrompt', () => {
  it('includes the paraphrased structure: rules, context, unknowns, and schema', () => {
    const prompt = buildAnalysisPrompt({
      text: 'the kerfuffle continued',
      unknownTerms: ['kerfuffle'],
      knownSummary: "'continued': B1",
      manyShot: [
        { inputText: 'a kerfuffle broke out', correctedLevelHints: { kerfuffle: 'B2' }, correctedReasoning: 'common in class' },
      ],
    });

    expect(prompt).toContain('Rules:');
    expect(prompt).toContain('authoritative');
    expect(prompt).toContain('kerfuffle');
    expect(prompt).toContain('Output schema:');
    expect(prompt).toContain('outOfCorpusLevels');
    // The many-shot block surfaces the approved example.
    expect(prompt).toContain('Approved trainer examples');
    expect(prompt).toContain('"kerfuffle":"B2"');
  });

  it('marks the many-shot block empty when there are no approved examples', () => {
    const prompt = buildAnalysisPrompt({
      text: 'water is good',
      unknownTerms: [],
      knownSummary: "'water': A1",
      manyShot: [],
    });
    expect(prompt).toContain('(none yet)');
  });
});
