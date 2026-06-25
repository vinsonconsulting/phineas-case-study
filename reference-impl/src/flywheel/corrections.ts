// The correction queue. In production these are two Firestore collections
// (per-word corrections and full-analysis corrections), each row carrying a
// `status` that gates whether it can affect the system. Here they are two arrays
// with the same status discipline. Nothing a trainer submits takes effect until a
// reviewer approves it.

import type { AnalysisCorrection, CefrLevel, CorrectionStatus, WordCorrection } from '../types';

export class CorrectionQueue {
  private words: WordCorrection[] = [];
  private analyses: AnalysisCorrection[] = [];
  private seq = 0;

  submitWordCorrection(input: {
    term: string;
    currentLevel: CefrLevel | null;
    suggestedLevel: CefrLevel;
    pos?: string;
    submittedBy: string;
    reason?: string;
  }): WordCorrection {
    const record: WordCorrection = {
      id: `wc_${++this.seq}`,
      status: 'pending',
      term: input.term.toLowerCase(),
      currentLevel: input.currentLevel,
      suggestedLevel: input.suggestedLevel,
      pos: input.pos,
      submittedBy: input.submittedBy,
      reason: input.reason,
    };
    this.words.push(record);
    return record;
  }

  submitAnalysisCorrection(input: {
    inputText: string;
    correctedAssessedLevel: CefrLevel;
    correctedReasoning: string;
    correctedLevelHints: Record<string, CefrLevel>;
    submittedBy: string;
  }): AnalysisCorrection {
    const record: AnalysisCorrection = {
      id: `ac_${++this.seq}`,
      status: 'pending',
      inputText: input.inputText,
      correctedAssessedLevel: input.correctedAssessedLevel,
      correctedReasoning: input.correctedReasoning,
      correctedLevelHints: input.correctedLevelHints,
      submittedBy: input.submittedBy,
    };
    this.analyses.push(record);
    return record;
  }

  wordCorrections(status?: CorrectionStatus): WordCorrection[] {
    return status ? this.words.filter((w) => w.status === status) : [...this.words];
  }

  analysisCorrections(status?: CorrectionStatus): AnalysisCorrection[] {
    return status ? this.analyses.filter((a) => a.status === status) : [...this.analyses];
  }

  findWord(id: string): WordCorrection | undefined {
    return this.words.find((w) => w.id === id);
  }

  findAnalysis(id: string): AnalysisCorrection | undefined {
    return this.analyses.find((a) => a.id === id);
  }
}
