import { describe, expect, it } from 'vitest';
import { distribution, levelForEntry } from '../src/leveling';
import type { LeveledToken, VocabularyEntry } from '../src/types';

const run: VocabularyEntry = {
  termNormalized: 'run',
  isPhrase: false,
  entries: [
    { pos: 'verb', level: 'A1' },
    { pos: 'noun', level: 'B2' },
  ],
  cefrLevel: 'A1',
};

describe('levelForEntry', () => {
  it('uses the POS sense when a matching hint is given', () => {
    expect(levelForEntry(run, 'noun')).toEqual({ level: 'B2', pos: 'noun' });
    expect(levelForEntry(run, 'verb')).toEqual({ level: 'A1', pos: 'verb' });
  });

  it('falls back to the headline level without a hint or on no match', () => {
    expect(levelForEntry(run)).toEqual({ level: 'A1' });
    expect(levelForEntry(run, 'adjective')).toEqual({ level: 'A1' });
  });
});

describe('distribution', () => {
  it('counts levels and reports the modal level', () => {
    const tokens: LeveledToken[] = [
      { term: 'a', level: 'B1', source: 'database', isPhrase: false },
      { term: 'b', level: 'B1', source: 'database', isPhrase: false },
      { term: 'c', level: 'A2', source: 'database', isPhrase: false },
    ];
    const dist = distribution(tokens);
    expect(dist.counts.B1).toBe(2);
    expect(dist.counts.A2).toBe(1);
    expect(dist.assessedLevel).toBe('B1');
  });

  it('resolves ties toward the easier level', () => {
    const tokens: LeveledToken[] = [
      { term: 'a', level: 'A2', source: 'database', isPhrase: false },
      { term: 'b', level: 'C1', source: 'database', isPhrase: false },
    ];
    expect(distribution(tokens).assessedLevel).toBe('A2');
  });
});
