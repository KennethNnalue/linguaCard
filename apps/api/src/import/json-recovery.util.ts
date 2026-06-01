/**
 * Attempts a full JSON.parse() first.
 * If that fails (truncated array, missing closing bracket),
 * falls back to extracting all complete JSON objects via a balanced brace scanner.
 *
 * Example: '[{"a":1},{"a":2},{"a' → [{a:1},{a:2}]
 */
export function recoverJsonArray(raw: string): Record<string, unknown>[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
  } catch {
    const results: Record<string, unknown>[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const obj = JSON.parse(cleaned.slice(start, i + 1));
            if (typeof obj === 'object' && obj !== null) {
              results.push(obj as Record<string, unknown>);
            }
          } catch { /* skip malformed */ }
          start = -1;
        }
      }
    }

    return results;
  }
}
