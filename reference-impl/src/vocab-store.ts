// In-memory stand-in for the vocabulary database. The production app keeps these
// rows in Firestore and reads them server-side; the shape and the access pattern
// are the same. This is where per-word levels live, and it is the only thing the
// per-word correction loop writes to.

import type { CefrLevel, PosEntry, VocabularyEntry } from './types';
import { loadVocabularyFixture } from './fixtures';

export class VocabularyStore {
  private byTerm = new Map<string, VocabularyEntry>();

  constructor(entries: VocabularyEntry[]) {
    for (const entry of entries) {
      this.byTerm.set(entry.termNormalized.toLowerCase(), clone(entry));
    }
  }

  static fromFixture(): VocabularyStore {
    return new VocabularyStore(loadVocabularyFixture());
  }

  // Batched lookup, mirroring the production "where term in [...]" query. Returns
  // only the terms the database knows; misses are simply absent from the map.
  lookup(terms: string[]): Map<string, VocabularyEntry> {
    const hits = new Map<string, VocabularyEntry>();
    for (const term of terms) {
      const norm = term.toLowerCase();
      const entry = this.byTerm.get(norm);
      if (entry && !hits.has(norm)) hits.set(norm, clone(entry));
    }
    return hits;
  }

  has(term: string): boolean {
    return this.byTerm.has(term.toLowerCase());
  }

  get(term: string): VocabularyEntry | undefined {
    const entry = this.byTerm.get(term.toLowerCase());
    return entry ? clone(entry) : undefined;
  }

  size(): number {
    return this.byTerm.size;
  }

  // The per-word correction loop calls this once an admin applies an approved
  // correction. New words are inserted; known words have their level updated.
  // POS is optional because the production trainer path does not capture it yet.
  upsert(term: string, level: CefrLevel, pos?: string): void {
    const norm = term.toLowerCase();
    const existing = this.byTerm.get(norm);

    if (!existing) {
      const entries: PosEntry[] = pos ? [{ pos, level }] : [];
      this.byTerm.set(norm, {
        termNormalized: norm,
        isPhrase: norm.includes(' '),
        entries,
        cefrLevel: level,
      });
      return;
    }

    existing.cefrLevel = level;
    if (pos) {
      const sense = existing.entries.find((e) => e.pos === pos);
      if (sense) sense.level = level;
      else existing.entries.push({ pos, level });
    }
  }
}

function clone(entry: VocabularyEntry): VocabularyEntry {
  return { ...entry, entries: entry.entries.map((e) => ({ ...e })) };
}
