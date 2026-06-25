// Turns approved full-analysis corrections into many-shot examples for the next
// model call, behind a cache that a reviewer's approval invalidates.
//
// In production the cache holds the formatted examples for a fixed TTL and is
// invalidated the moment an admin approves a correction, so the next analysis
// picks up the change without waiting for the TTL to lapse. The dual-mode detail
// (inline chat history below a token threshold, server-side cached content above
// it) is a cost optimization that does not change the behavior shown here.

import type { CorrectionQueue } from './corrections';
import type { ManyShotExample } from '../llm';

export class ManyShotCache {
  private cached: ManyShotExample[] | null = null;

  // Called on approval. The next get() rebuilds from the current approved set.
  invalidate(): void {
    this.cached = null;
  }

  get(queue: CorrectionQueue): ManyShotExample[] {
    if (this.cached) return this.cached;
    this.cached = queue.analysisCorrections('approved').map((correction) => ({
      inputText: correction.inputText,
      correctedLevelHints: correction.correctedLevelHints,
      correctedReasoning: correction.correctedReasoning,
    }));
    return this.cached;
  }
}
