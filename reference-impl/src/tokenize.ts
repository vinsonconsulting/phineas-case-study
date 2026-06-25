// Minimal word tokenizer for the reference. Lowercases, keeps letter runs (with
// internal apostrophes), and drops a small set of function words so the level
// distribution reflects content words. The production app does more here
// (phrase extraction, normalization); this is enough to show the pattern.

const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these',
  'those', 'for', 'with', 'as', 'i', 'you', 'he', 'she', 'they', 'we', 'my',
  'your', 'his', 'her', 'their', 'our', 'so', 'if', 'then', 'than',
]);

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return raw.filter((w) => !FUNCTION_WORDS.has(w));
}
