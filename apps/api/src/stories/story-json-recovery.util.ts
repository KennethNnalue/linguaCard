interface GeneratedSentence {
  german: string;
  native: string;
  vocabWordsUsed: string[];
}

interface GeneratedStoryContent {
  title: string;
  titleTranslation: string;
  sentences: GeneratedSentence[];
}

export interface RecoveryResult {
  content: GeneratedStoryContent | null;
  sentenceCount: number;
  wasRecovered: boolean;
}

/**
 * Attempts to parse a raw AI response as GeneratedStoryContent.
 *
 * Strategy:
 *  1. Strip markdown fences if present.
 *  2. Try JSON.parse() on the cleaned string — fast path for well-formed responses.
 *  3. On failure: scan for title/titleTranslation via regex.
 *  4. Scan for complete sentence objects via depth-tracking brace scanner.
 *  5. Return whatever was found; callers decide the minimum acceptable count.
 */
export function recoverStoryContent(rawText: string): RecoveryResult {
  // Strip markdown fences (```json ... ``` or ``` ... ```)
  let cleaned = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  // Extract the outermost JSON object if there's surrounding prose
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace > 0 || (lastBrace !== -1 && lastBrace < cleaned.length - 1)) {
    if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
  }

  if (!cleaned) {
    return { content: null, sentenceCount: 0, wasRecovered: true };
  }

  // ── Fast path: try full parse ────────────────────────────────────────────
  try {
    const parsed = JSON.parse(cleaned) as GeneratedStoryContent;
    if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
      return {
        content: parsed,
        sentenceCount: parsed.sentences.length,
        wasRecovered: false,
      };
    }
  } catch {
    // fall through to recovery
  }

  // ── Recovery path ────────────────────────────────────────────────────────
  const titleMatch = cleaned.match(/"title"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
  const titleTransMatch = cleaned.match(/"titleTranslation"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);

  const title = titleMatch?.[1] ?? 'Unvollständige Geschichte';
  const titleTranslation = titleTransMatch?.[1] ?? 'Incomplete Story';

  const sentences = recoverSentences(cleaned);

  if (sentences.length === 0) {
    return { content: null, sentenceCount: 0, wasRecovered: true };
  }

  return {
    content: { title, titleTranslation, sentences },
    sentenceCount: sentences.length,
    wasRecovered: true,
  };
}

/**
 * Extracts all complete sentence objects from a raw JSON string.
 * An object is "complete" if it has a non-empty `german` key at its top level.
 *
 * We scan for objects that contain the literal key `"german"` before descending
 * into nested structure — this skips the outer wrapper `{ "title": ..., "sentences": [...] }`
 * and goes straight to the leaf sentence objects.
 */
function recoverSentences(raw: string): GeneratedSentence[] {
  const results: GeneratedSentence[] = [];

  // Find each `"german"` key occurrence and work backwards to the containing object
  const germanKeyRe = /"german"\s*:/g;
  let keyMatch: RegExpExecArray | null;

  while ((keyMatch = germanKeyRe.exec(raw)) !== null) {
    // Walk backwards from the key position to find the opening `{` of this object
    let objStart = -1;
    let depth = 0;
    for (let k = keyMatch.index - 1; k >= 0; k--) {
      if (raw[k] === '}') depth++;
      if (raw[k] === '{') {
        if (depth === 0) { objStart = k; break; }
        depth--;
      }
    }
    if (objStart === -1) continue;

    // Now walk forward from objStart to find the matching closing `}`
    let inString = false;
    let escape = false;
    let braceDepth = 0;
    let objEnd = -1;

    for (let k = objStart; k < raw.length; k++) {
      const ch = raw[k];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braceDepth++;
      if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) { objEnd = k; break; }
      }
    }
    if (objEnd === -1) continue;

    try {
      const obj = JSON.parse(raw.slice(objStart, objEnd + 1)) as Record<string, unknown>;
      if (typeof obj['german'] === 'string' && obj['german'].length > 0) {
        results.push({
          german: obj['german'] as string,
          native: typeof obj['native'] === 'string' ? obj['native'] : '',
          vocabWordsUsed: Array.isArray(obj['vocabWordsUsed'])
            ? (obj['vocabWordsUsed'] as string[])
            : [],
        });
        // Advance the regex past this object to avoid re-matching keys inside it
        germanKeyRe.lastIndex = objEnd + 1;
      }
    } catch { /* malformed object — skip */ }
  }

  return results;
}
