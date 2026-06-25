// The model boundary.
//
// The model has a narrow job: estimate CEFR levels for words the database has
// never seen, and write a short rationale. It is never asked to level a known
// word. The interface encodes that contract; the database owns known levels.
//
// `FakeLlm` is a deterministic stand-in so the whole thing runs offline with no
// API key. The real-model seam at the bottom shows where Gemini 2.5 Flash plugs
// in; it is intentionally not implemented in this reference.

import type { CefrLevel } from './types';

export interface ManyShotExample {
  inputText: string;
  // A compact encoding of the per-token judgments the trainer's corrected output
  // endorsed. The real examples are full corrected analyses; this is enough to
  // show how approved corrections steer later estimates.
  correctedLevelHints: Record<string, CefrLevel>;
  correctedReasoning: string;
}

export interface ModelAnalysisRequest {
  text: string;
  unknownTerms: string[]; // the only words the model is asked to level
  knownSummary: string; // human-readable summary of what the database already decided
  manyShot: ManyShotExample[]; // approved corrections, as few-shot guidance
}

export interface ModelAnalysisResponse {
  outOfCorpusLevels: Record<string, CefrLevel>;
  reasoning: string;
}

export interface LlmClient {
  analyze(req: ModelAnalysisRequest): Promise<ModelAnalysisResponse>;
}

export class FakeLlm implements LlmClient {
  async analyze(req: ModelAnalysisRequest): Promise<ModelAnalysisResponse> {
    // Approved many-shot examples act as guidance: any token an approved trainer
    // example endorsed at a given level wins over the default estimate. Later
    // examples override earlier ones. This is the deterministic analogue of a
    // model paying attention to its few-shot context.
    const endorsed = new Map<string, CefrLevel>();
    for (const example of req.manyShot) {
      for (const [token, level] of Object.entries(example.correctedLevelHints)) {
        endorsed.set(token.toLowerCase(), level);
      }
    }

    const outOfCorpusLevels: Record<string, CefrLevel> = {};
    for (const term of req.unknownTerms) {
      const norm = term.toLowerCase();
      outOfCorpusLevels[term] = endorsed.get(norm) ?? estimateLevel(norm);
    }

    const reasoning =
      req.manyShot.length > 0
        ? `Assessed with ${req.manyShot.length} approved trainer example(s) in context. ${req.knownSummary}`
        : `Assessed from the vocabulary database. ${req.knownSummary}`;

    return { outOfCorpusLevels, reasoning };
  }
}

// A deliberately crude, deterministic stand-in for a model's estimate of an
// unknown word: longer words read as harder. Illustrative only. The production
// app uses Gemini 2.5 Flash for this step, with the paraphrased prompt in
// prompt.ts and the approved corrections attached as chat history.
function estimateLevel(term: string): CefrLevel {
  const length = term.replace(/[^a-z]/g, '').length;
  if (length <= 4) return 'A2';
  if (length <= 6) return 'B1';
  if (length <= 8) return 'B2';
  if (length <= 10) return 'C1';
  return 'C2';
}

// --- Real-model seam (not used by the demo or tests) ---
//
// In production this interface is backed by Google Gemini 2.5 Flash. A real
// adapter would build the paraphrased prompt (buildAnalysisPrompt), attach the
// approved corrections as many-shot chat-history turns, request a JSON response,
// and parse the structured output. It is left unimplemented on purpose: this repo
// runs entirely on synthetic fixtures and never calls a real API.
//
//   export class GeminiLlm implements LlmClient {
//     async analyze(req: ModelAnalysisRequest): Promise<ModelAnalysisResponse> {
//       const prompt = buildAnalysisPrompt(req);
//       const chat = model.startChat({ history: toHistory(req.manyShot) });
//       const res = await chat.sendMessage(prompt);
//       return parseJson(res.response.text());
//     }
//   }
