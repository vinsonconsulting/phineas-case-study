// Loads the synthetic fixtures. Everything these functions return is invented for
// this reference implementation. None of it is the production vocabulary database
// or real CEFR reference data.

import { readFileSync } from 'node:fs';
import type { CefrLevel, VocabularyEntry } from './types';

interface VocabFixture {
  _note: string;
  entries: VocabularyEntry[];
}

interface TrainingFixture {
  _note: string;
  examples: Array<{
    inputText: string;
    correctedAssessedLevel: CefrLevel;
    correctedReasoning: string;
    correctedLevelHints: Record<string, CefrLevel>;
  }>;
}

function readJson<T>(relativePath: string): T {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

export function loadVocabularyFixture(): VocabularyEntry[] {
  return readJson<VocabFixture>('../fixtures/vocabulary.json').entries;
}

export function loadTrainingExamplesFixture(): TrainingFixture['examples'] {
  return readJson<TrainingFixture>('../fixtures/training-examples.json').examples;
}
