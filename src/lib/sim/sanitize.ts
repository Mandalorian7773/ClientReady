/**
 * User-supplied scenario fields and learner utterances are embedded in model
 * prompts as DATA. We neutralise characters that could close our delimiters
 * and strip control characters so they cannot impersonate system structure.
 */
export function asData(value: unknown, max = 800): string {
  const s = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Render a record of fields as an indented data block. */
export function dataBlock(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${asData(v)}`)
    .join("\n");
}

/** Escape model-generated text before inserting into HTML-like contexts (React already escapes JSX text). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
