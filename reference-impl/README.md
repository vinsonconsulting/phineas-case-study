# Reference implementation

This is an illustrative, synthetic reference implementation of the PHINEAS data flywheel. It is not the production application, it is not a deployable clone, and it does not contain any real client data, real vocabulary, real prompts, or any secrets. It exists to make one pattern inspectable in code: per-word CEFR levels are served from a database, and human-approved trainer corrections improve that database and the model's context over time.

Everything it runs on is invented. The vocabulary in `fixtures/vocabulary.json` is made up. The trainer examples in `fixtures/training-examples.json` are made up. The model is a deterministic stand-in (`FakeLlm`) so the whole thing runs offline with no API key. The production app uses Google Gemini 2.5 Flash behind the same interface; the seam is shown in `src/llm.ts` but left unimplemented here.

## Run it

```bash
cd reference-impl
npm install
npm run build   # typecheck
npm test        # vitest
npm run demo    # end-to-end flywheel walkthrough
```

## What's here

| Path | What it shows |
|------|----------------|
| `src/types.ts` | The data shapes. Per-word levels live on `VocabularyEntry`, with POS-aware senses. |
| `src/vocab-store.ts` | The in-memory stand-in for the vocabulary database. The only thing the per-word loop writes to. |
| `src/leveling.ts` | Per-token levels from database entries, plus the modal-level distribution. No model involved. |
| `src/analyze.ts` | The pipeline: extract, look up the database, ask the model only about unknown words, merge with the database winning. |
| `src/llm.ts` | The model boundary. `FakeLlm` for offline runs; the real Gemini seam is documented, not implemented. |
| `src/prompt.ts` | A paraphrase of the production prompt's structure. Not the real wording. |
| `src/flywheel/` | The two correction loops: submit, review, apply (per-word) and approve plus many-shot (full analysis). |
| `fixtures/` | Synthetic vocabulary and trainer examples. Clearly labeled as invented. |
| `test/flywheel.test.ts` | The proof: an approved correction changes the next analysis, and approval is required for it to count. |

## What it deliberately leaves out

The production app does more than this: authentication and roles, quotas and a spend breaker, phrase extraction, streaming progress over SSE, rewrites at adjacent levels, teaching notes, audit logging, and the dual-mode many-shot delivery (inline history below a token threshold, server-side cached content above it). Those are described in [`../docs/architecture.md`](../docs/architecture.md). They are left out here so the flywheel and the leveling pattern stay in focus.
