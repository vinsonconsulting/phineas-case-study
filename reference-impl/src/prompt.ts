// Builds the instruction text sent to the model.
//
// This is a PARAPHRASE of the production prompt's structure, not its wording. The
// goal is to show the shape (role, rules, many-shot examples, database context,
// the input, and the output schema) without reproducing the engineered text from
// the private app. The real prompt is more detailed and is not published.

import type { ModelAnalysisRequest } from './llm';

export function buildAnalysisPrompt(req: ModelAnalysisRequest): string {
  const rules = [
    'Treat the vocabulary database matches as authoritative. Do not relevel a word the database already knows.',
    'Only estimate a CEFR level for the words listed as unknown.',
    'Weigh the overall assessment toward the most common level among content words.',
    'Keep the rationale short and supportive, the way you would explain it to a teacher.',
    'Return JSON only, matching the schema below.',
  ];

  const schema = [
    '{',
    '  "outOfCorpusLevels": { "<word>": "A1|A2|B1|B2|C1|C2" },',
    '  "reasoning": "<two or three sentences>"',
    '}',
  ].join('\n');

  const manyShot =
    req.manyShot.length === 0
      ? '(none yet)'
      : req.manyShot
          .map((example, index) => {
            const hints = JSON.stringify(example.correctedLevelHints);
            return [
              `Example ${index + 1}:`,
              `  Text: ${truncate(example.inputText)}`,
              `  Endorsed levels: ${hints}`,
              `  Note: ${example.correctedReasoning}`,
            ].join('\n');
          })
          .join('\n');

  return [
    'Role: you help ESL teachers gauge the CEFR difficulty of short texts.',
    '',
    'Rules:',
    ...rules.map((r) => `- ${r}`),
    '',
    'Approved trainer examples (your few-shot guidance):',
    manyShot,
    '',
    'Vocabulary the database already leveled (context, already decided):',
    req.knownSummary || '(none matched)',
    '',
    'Words the database did not know (estimate these):',
    req.unknownTerms.length ? req.unknownTerms.join(', ') : '(none)',
    '',
    'Text to assess:',
    req.text,
    '',
    'Output schema:',
    schema,
  ].join('\n');
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
