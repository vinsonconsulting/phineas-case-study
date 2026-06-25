# The data flywheel

The flywheel is the mechanism that lets PHINEAS improve from use without letting it drift. Teachers spot leveling they disagree with, they say so, a reviewer signs off, and the next analysis is better for it. This page walks through the two loops end to end. The [reference implementation](../reference-impl) runs both on synthetic data.

## Why levels come from the database

A language model can estimate a CEFR level, but the estimate is not stable and there is nowhere in it to record a house decision. PHINEAS stores levels in a vocabulary database and reads them at analysis time. The model is asked only about words the database has not seen.

This makes the leveling stable, since a stored level does not change between requests, and it makes it the school's own, since the levels are theirs to set and correct. The cost is that the database needs to be built and maintained. The two loops below are how that maintenance happens as a side effect of normal use.

## Loop one: per-word corrections

This loop grows and tunes the database itself.

1. A trainer is analyzing text and disagrees with a word's level. They submit a correction: the term, its current level, and the level it should be.
2. The correction is stored with a `pending` status. It has no effect yet.
3. An admin reviews the queue. They can deny the correction, which marks it `denied` and ends it, or approve it, which marks it `approved`.
4. Approval alone does not change anything a user sees. A separate apply step writes the approved correction into the vocabulary database and marks it `applied`.
5. From that point, every analysis that touches the word reads the corrected level.

The status lifecycle is `pending -> approved -> applied`, with `denied` as the off-ramp. The two-step approve-then-apply split means an admin can approve a batch of corrections and then commit them to the database in one controlled action.

In the reference implementation this is [`flywheel/corrections.ts`](../reference-impl/src/flywheel/corrections.ts) for submission, [`flywheel/review.ts`](../reference-impl/src/flywheel/review.ts) for approve and apply, and [`vocab-store.ts`](../reference-impl/src/vocab-store.ts) for the write. The apply step calls `upsert`, which updates a known word or inserts a new one.

## Loop two: many-shot corrections

This loop steers the model on the open-ended parts of the job, the ones a fixed database cannot cover, like estimating a word that has never been seen or judging an unusual passage.

1. A trainer corrects a whole analysis, not just one word. They fix the output and submit the corrected version.
2. The correction is stored with a `pending` status.
3. An admin approves it. Approval invalidates a cache.
4. On the next analysis, the system rebuilds its set of approved examples and includes this one as a worked example in the context the model sees. The model treats it as guidance for the judgment the school wants.

The cache invalidation matters for responsiveness. The approved examples are cached so they are not rebuilt on every request, but a fresh approval clears the cache immediately, so the change takes effect on the next call rather than waiting for a timer to lapse. In production the examples are delivered inline when the set is small and through the model's server-side cached-content feature once it grows large, which keeps the cost down.

In the reference implementation this is [`flywheel/manyshot.ts`](../reference-impl/src/flywheel/manyshot.ts) for the cache and [`flywheel/review.ts`](../reference-impl/src/flywheel/review.ts) for the approval that invalidates it. The deterministic stand-in model in [`llm.ts`](../reference-impl/src/llm.ts) reads the approved examples and lets an endorsed level win over its default estimate, which is the offline analogue of a model attending to its few-shot context.

## The gate they share

Both loops pass through the same control: a human approves before anything changes. The model never edits the database. A trainer can propose, but only an admin can approve, and the per-word loop adds a deliberate second action to commit. Every change has an author and a reviewer.

That is the oversight story. It is also the reason the tool can be trusted to keep improving rather than slowly going sideways. The people closest to the classroom shape the data, and a reviewer keeps the bar consistent.

## Seeing it run

`npm run demo` in the reference implementation walks through both loops on one sentence and prints the before and after. `test/flywheel.test.ts` asserts the same behavior, including the part that is easy to get wrong: a correction has no effect until it is approved, and the per-word correction has no effect until it is also applied.
