/** Small copy helpers for scenario text shown in the UI. */

// Brand names keep their capitals when an offer title is lowercased.
const BRANDS = new Set(["shopify", "wordpress", "zendesk", "salesforce", "webflow", "wix", "squarespace", "google", "meta", "instagram", "notion", "slack", "stripe", "excel"]);

/** "AI Receptionist" -> "AI receptionist": lowercase ordinary title-case words, keep acronyms, brands and mixed case. */
export function offerPhrase(name: string): string {
  return name
    .trim()
    .split(/(\s+|-)/)
    .map((w) => (/^[A-Z][a-z']+$/.test(w) && !BRANDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join("");
}
