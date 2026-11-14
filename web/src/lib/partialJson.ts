/**
 * Best-effort parser for a JSON document that is still arriving.
 *
 * While the report model streams tokens, the text is valid only up to the
 * last finished token. This closes an open string and any unclosed arrays or
 * objects, then drops a trailing comma, so the UI can paint fields that are
 * already complete. It is intentionally small and local: nothing is sent out.
 */
export function parsePartialJson(input: string): unknown | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;
  const repaired = repairPartialJson(trimmed);
  return tryParse(repaired);
}

function tryParse(input: string): unknown | undefined {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return undefined;
  }
}

export function repairPartialJson(input: string): string {
  let out = "";
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escape = false;
  for (const ch of input) {
    out += ch;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") stack.push(ch);
    else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
  }
  if (inString) out += '"';
  out = out.replace(/,\s*$/u, "");
  out = out.replace(/:\s*$/u, ": null");
  out = out.replace(/,\s*"[^"\\]*$/u, "");
  while (stack.length) {
    const open = stack.pop();
    out += open === "{" ? "}" : "]";
  }
  return out;
}
