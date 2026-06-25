# PHINEAS: a CEFR teaching assistant, and the data flywheel behind it

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/vinsonconsulting/phineas-case-study/actions/workflows/ci.yml/badge.svg)](https://github.com/vinsonconsulting/phineas-case-study/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/product-phineas.app-d97706.svg)](https://phineas.app)
[![Reference impl](https://img.shields.io/badge/code-synthetic%20reference-6E9F18.svg)](reference-impl)

PHINEAS is a CEFR teaching assistant for ESL educators. Paste in a text and it tells you the CEFR level, breaks the vocabulary down word by word, rewrites the passage one level easier and one level harder, and suggests which words to pre-teach. It runs at [phineas.app](https://phineas.app).

The product source is private. It was custom-built for an overseas English-language school on a speculative basis, the client relationship is active, and it is in beta-user trials. This repository is the public stand-in: a writeup of how it works and why it is built the way it is, plus a small, runnable [reference implementation](reference-impl) of the part I am most proud of. The reference implementation uses invented vocabulary and paraphrased prompts. It is not the production app and not a deployable clone. The redaction is deliberate and is explained at the end.

## The problem

A teacher planning a lesson needs to know whether a reading is pitched at the right level for the class. CEFR gives a shared vocabulary for that question, from A1 for a beginner to C2 for near-native command. Doing the leveling by hand is slow and inconsistent. Two teachers will disagree about whether a given word is B1 or B2, and the same teacher will disagree with herself a week later.

A language model can read a passage and guess its level. The catch is that the guess drifts. Ask twice and you can get two answers, and there is no obvious place to record the school's own house decisions about borderline words. For a tool a teacher is meant to trust week after week, drift is the whole problem.

## The shape of the answer

The core decision in PHINEAS is that a word's CEFR level is data, not a model output. Levels live in a vocabulary database. When a text comes in, the app looks each word up and reads the stored level. The model is asked only about words the database has never seen, and it writes the human-facing prose around the result. The level a teacher sees for a known word is the level the school has agreed on, not whatever the model felt like saying this morning.

That choice buys three things. The output is stable, because a stored level does not change between requests. It is correct by the school's own standard, because the levels are theirs to set. And it is auditable, because every level has a provenance: it came from the database, or it was a model estimate for an unknown word. The reference implementation carries that provenance on every token so you can see it.

The trade is that the database has to be built and kept current. That is where the flywheel comes in.

## The data flywheel

The people who know whether a word is B1 or B2 are the teachers using the tool. PHINEAS gives them a way to say so, and turns their corrections into improvements that everyone's next analysis benefits from. There is a role hierarchy behind it: a `user` analyzes text, a `trainer` can submit corrections, and an `admin` reviews them. Nothing a trainer submits takes effect until an admin approves it.

There are two correction loops, and they are worth keeping separate because they fix different things.

The first is the per-word loop. A trainer says "this word should be B2, not C1." The correction sits in a queue with a `pending` status. An admin reviews it, approves it, and applies it, which writes the new level into the vocabulary database. From then on, every analysis that touches that word reads the corrected level. This is the loop that grows and tunes the database itself.

The second is the many-shot loop. A trainer can correct a whole analysis, not just one word, and submit the fixed version. Once an admin approves it, that corrected example is added to the context the model sees on its next call, as a worked example of the judgment the school wants. Approval invalidates a cache so the change takes effect immediately rather than waiting for a timer. This loop steers the model's behavior on the open-ended parts of the job, like estimating a word the database does not yet know.

Both loops share the same gate: a human approves before anything changes. That is the oversight pattern. The model never edits the database, and a single trainer cannot push a change live on their own. A reviewer signs off, and the change is recorded.

[`docs/data-flywheel.md`](docs/data-flywheel.md) walks through both loops in detail. The [reference implementation](reference-impl) implements them on synthetic data, and `npm run demo` prints the before and after:

```
1. Baseline analysis (no approved corrections in effect)
  assessed level:              A2
  meticulous:                  C1 (from database)
  kerfuffle:                   C1 (from model-estimate)

2. A trainer submits a per-word correction: meticulous C1 -> B2
   Admin approves and applies it (1 correction applied).
  meticulous now:              B2 (from database)

3. An admin approves a full-analysis correction endorsing kerfuffle as B2
  kerfuffle now:               B2 (from model-estimate)

Summary
  meticulous:    C1 (from database)        ->  B2 (from database)
  kerfuffle:     C1 (from model-estimate)  ->  B2 (from model-estimate)
  assessed level:              A2  ->  B2
```

`test/flywheel.test.ts` asserts the same thing as a test, including that a correction has no effect until it is approved.

## Architecture at a readable altitude

| Layer | Choice |
|-------|--------|
| Framework | Next.js (App Router) |
| Auth | Firebase Authentication (Google sign-in), with a numeric role hierarchy |
| Database | Cloud Firestore, accessed server-side through the Admin SDK |
| Model | Google Gemini 2.5 Flash |
| Hosting | Vercel |

Analysis runs as a staged pipeline. The server works through a fixed sequence of steps and streams progress to the browser over server-sent events, so the user watches the work happen instead of staring at a spinner. The early steps check the session, check quotas, validate the input, extract the words, and look them up in the vocabulary database. Only then does the model run, and its work is itself split into named sub-steps: assess the overall level, draft the reasoning, write teaching notes, compose the easier and harder rewrites, and pick the pre-teaching vocabulary. The model is told to return JSON, and a parse step validates it before anything is shown.

The order is the point. Vocabulary lookup happens before the model is ever called, which is the structural reason a stored level cannot be overridden by a model guess. The full stage list lives in [`docs/architecture.md`](docs/architecture.md).

## Latency and cost

Gemini 2.5 Flash is the model because the job is high volume and latency-sensitive, and Flash is fast and cheap per call. The slow part of a request is composing two full rewrites of a long passage, which is why the request budget is generous (up to 120 seconds for the longest inputs) rather than tuned for a short prompt.

A few choices keep cost and latency down:

- Known words are answered from the database, which is a cheap read and avoids spending model tokens on a question that already has an answer.
- Vocabulary lookups are cached in memory for a few minutes and run as batched, concurrent queries, so a long text does not turn into hundreds of serial round trips.
- A daily spend ceiling acts as a circuit breaker. If the day's estimated cost crosses the limit, the endpoint stops rather than running up a surprise bill.
- The many-shot examples are delivered two ways depending on size: inline in the request when the set is small, and through the model's server-side cached-content feature when it grows past a token threshold, which is cheaper than resending the same examples on every call.

## Why this is here

I build AI products, and the part of this one worth showing a hiring manager is the design decision plus its mechanism. A human-in-the-loop loop that improves a structured database through review, with leveling sourced from the database rather than the model, is a concrete oversight pattern with a real reason behind it. It keeps a teaching tool stable and correct while still letting it learn from the people who use it. The reference implementation backs the description with code you can run and tests you can read, which is harder to wave away than prose.

What I am not claiming: this is a large deployment, or that the flywheel has processed thousands of corrections. It was built on spec for one school and is in beta trials. The engineering is real and the pattern is sound. The scale is early, and I would rather say so.

## A note on the redaction

This repository is public and the source app serves a live client relationship, so some things are deliberately left out. There is no client identity anywhere in here. The vocabulary in the reference implementation is invented, not the school's real word list or its CEFR assignments. The prompts are paraphrased to show their structure, not copied. There are no keys, config, or user data. What is shareable is the method, and the method is what this repo is for. When something sat on the line between useful and proprietary, it was left out.

## Repository layout

```
.
├── README.md              # this case study
├── docs/
│   ├── architecture.md     # the staged pipeline and the stack, in more detail
│   └── data-flywheel.md    # both correction loops, end to end
└── reference-impl/         # runnable, synthetic reference implementation (TypeScript)
```
