// Shared types for the reference implementation.
//
// The one idea worth holding onto while reading these: a word's CEFR level is a
// property of the vocabulary database (VocabularyEntry), not something the model
// invents per request. The model only fills gaps for words the database has never
// seen. Everything else here serves that split.

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const CEFR_ORDER: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// A part-of-speech-specific level. The production schema stores one of these per
// sense, so a word like "run" can be A1 as a verb and B2 as a noun.
export interface PosEntry {
  pos: string; // 'verb', 'noun', 'adjective', ...
  level: CefrLevel;
}

// One row in the vocabulary database. Per-word levels live here.
export interface VocabularyEntry {
  termNormalized: string; // lowercase headword or phrase
  isPhrase: boolean;
  entries: PosEntry[]; // POS-aware senses (may be empty for level-only records)
  cefrLevel: CefrLevel; // headline level, kept for quick reads
}

// What a single analyzed token resolves to. The `source` field makes provenance
// explicit: did this level come from the database or from a model estimate?
export interface LeveledToken {
  term: string;
  level: CefrLevel;
  pos?: string;
  source: 'database' | 'model-estimate';
  isPhrase: boolean;
}

export interface LevelDistribution {
  counts: Record<CefrLevel, number>;
  assessedLevel: CefrLevel; // the modal content level
}

export interface AnalysisResult {
  assessedLevel: CefrLevel;
  tokens: LeveledToken[];
  distribution: LevelDistribution;
  outOfCorpus: Array<{ term: string; level: CefrLevel }>;
  reasoning: string; // short, teacher-facing rationale (illustrative)
}

// --- Flywheel types ---

export type CorrectionStatus = 'pending' | 'approved' | 'denied' | 'applied';

// Per-word correction: a trainer says "this word should be level X". Approved and
// applied corrections are written back into the vocabulary database.
export interface WordCorrection {
  id: string;
  term: string;
  currentLevel: CefrLevel | null;
  suggestedLevel: CefrLevel;
  pos?: string; // optional; the production trainer UI does not capture POS yet
  submittedBy: string;
  reason?: string;
  status: CorrectionStatus;
}

// Full-analysis correction: a trainer fixes a whole analysis. Approved ones become
// many-shot examples injected into the next model call. `correctedLevelHints` is a
// compact stand-in for the per-token judgments the corrected output encodes.
export interface AnalysisCorrection {
  id: string;
  inputText: string;
  correctedAssessedLevel: CefrLevel;
  correctedReasoning: string;
  correctedLevelHints: Record<string, CefrLevel>;
  submittedBy: string;
  status: CorrectionStatus;
}
