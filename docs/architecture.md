# Architecture

This describes how PHINEAS is built, at a level a reader can follow without the source. It is generic on purpose. The runnable [reference implementation](../reference-impl) mirrors the parts that matter for the data flywheel.

## Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js (App Router), TypeScript | Server routes hold all the logic that touches data or the model. |
| Auth | Firebase Authentication (Google sign-in) | A numeric role hierarchy gates every API route. |
| Database | Cloud Firestore | Accessed server-side only, through the Admin SDK. Client reads are denied by security rules. |
| Model | Google Gemini 2.5 Flash | Chosen for speed and cost on a high-volume, latency-sensitive job. |
| Hosting | Vercel | |

## Roles

Access is a numeric hierarchy, and higher roles inherit everything below.

| Role | Can do |
|------|--------|
| `user` | Analyze text, get rewrites, submit feedback. |
| `trainer` | Everything a user can, plus submit CEFR corrections. |
| `admin` | Everything a trainer can, plus review and approve corrections, manage users, and view logs. |

Every server route begins by verifying the caller and checking the required role. Auth is never optional.

## The vocabulary database

The database is where per-word CEFR levels live. Each entry is keyed by a normalized term and carries part-of-speech-aware senses, so a word with more than one grammatical use can hold a different level per sense.

```
VocabularyEntry {
  termNormalized: string          // lowercase headword or phrase
  isPhrase: boolean
  entries: { pos, level }[]       // POS-aware senses, e.g. run -> verb: A1, noun: B2
  cefrLevel: CEFRLevel            // headline level, for quick reads
}
```

A note on honesty here. The schema and the lookup path are POS-aware, and analysis can pick the sense that matches how a word is used. The trainer correction path currently captures a single level per word rather than a per-sense level. Capturing part of speech in the correction UI is a known follow-up. The reference implementation models the POS-aware lookup faithfully and notes the same limitation in the correction flow.

## The analysis pipeline

A request to analyze text runs as an ordered sequence of stages. The server streams each stage's status to the browser over server-sent events, so the interface shows real progress rather than a single spinner. The wire format is one event per stage, then a terminal done or error event.

The stages, in order:

1. `auth`: verify the session.
2. `quota`: check daily and per-minute limits.
3. `validate`: check length and word count.
4. `extract`: tokenize the text into words and phrases.
5. `vocab`: look the terms up in the vocabulary database.
6. `gemini_assess`: the model gauges the overall CEFR level.
7. `gemini_reasoning`: the model drafts a teacher-facing rationale.
8. `gemini_notes`: the model generates teaching notes.
9. `gemini_rewrites`: the model composes one easier and one harder rewrite. This is the slow step.
10. `gemini_vocab`: the model selects the words most worth pre-teaching.
11. `parse`: validate the model's JSON output.
12. `log`: record usage and write the activity log.

The ordering carries a correctness guarantee. The vocabulary lookup at step 5 happens before the model runs at step 6, and the levels it returns are treated as decided. The model is given the database matches as context and told to trust them, and to estimate levels only for words the database did not have. A stored level cannot be overwritten by a model guess because, by the time the model runs, the known levels are already settled.

The model is asked to return structured JSON, and the `parse` stage validates it before any result reaches the user. Decomposing the model's work into named sub-steps (assess, reasoning, notes, rewrites, vocab) is what makes the long-running request legible and keeps the output in a fixed shape.

## Cost and latency controls

- Known words are answered from the database, a cheap read, instead of spending model tokens.
- Vocabulary lookups are cached in memory for a few minutes and issued as batched, concurrent queries.
- A daily spend ceiling stops the analysis endpoint if the day's estimated cost crosses the limit.
- Approved many-shot examples are delivered inline when the set is small and through the model's server-side cached-content feature once it grows past a token threshold, which avoids resending the same examples on every call.

## What the reference implementation keeps and drops

The [reference implementation](../reference-impl) keeps the parts that carry the idea: the POS-aware vocabulary store, the database-first leveling, the merge step where the database wins, and both correction loops. It drops auth and roles, quotas and the spend breaker, phrase extraction, SSE streaming, the rewrites and teaching notes, and audit logging. The model is a deterministic stand-in so the whole thing runs offline. The data is invented.
