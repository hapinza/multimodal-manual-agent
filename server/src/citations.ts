// Citation guard: the model sometimes cites a page it never opened (it knows the fact from the catalog).
// Before text reaches the user, rewrite those citations as pointers ("see p.22") so a citation
// only ever claims "I read this page" when the agent actually did. Pages it opened stay as they are.
const PAGE_REF = /(see\s+)?((?:Quick Start(?:\s+Guide)?\s*\(?\s*)?)p\.\s?(\d{1,2})\b/gi;

export function citedPageId(quickStart: string, page: string): string {
  return `${quickStart ? "quickstart" : "manual"}-${page.padStart(2, "0")}`;
}

export function markUnopenedCitations(text: string, opened: Set<string>): string {
  const fixed = text.replace(PAGE_REF, (match, see, quickStart, page) => {
    if (see || opened.has(citedPageId(quickStart, page))) return match;
    // "Quick Start (p.2)" -> "Quick Start (see p.2)"; "p.22" -> "see p.22"
    return quickStart.includes("(") ? match.replace("(", "(see ") : `see ${match}`;
  });
  return opened.has("selection-01") ? fixed : fixed.replace(/\((Selection Chart)\)/gi, "(see $1)");
}
