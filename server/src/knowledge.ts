// Loads the offline-built knowledge (catalog, page text, page images) once at startup.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const KNOWLEDGE = fileURLToPath(new URL("../../knowledge/", import.meta.url));

export type CatalogEntry = {
  id: string;
  doc: string;
  page: number;
  title: string;
  section: string;
  summary: string;
  figures: { description: string; kind: string; worth_showing: boolean }[];
  keywords: string[];
};

export const catalog: Record<string, CatalogEntry> = JSON.parse(
  readFileSync(KNOWLEDGE + "catalog.json", "utf-8")
);
const pageText: Record<string, string> = JSON.parse(
  readFileSync(KNOWLEDGE + "page_text.json", "utf-8")
);

export const pageIds = Object.keys(catalog) as [string, ...string[]];

export function getPageText(id: string): string {
  return pageText[id] || "(no extractable text on this page; read the image)";
}

export async function getPageImageBase64(id: string): Promise<string> {
  return (await readFile(`${KNOWLEDGE}pages/${id}.png`)).toString("base64");
}

// The "map" that goes into the system prompt: id + title + summary, plus figures worth showing.
export function catalogForPrompt(): string {
    return Object.values(catalog)
      .map((e) => {
        const figures = e.figures.filter((f) => f.worth_showing).map((f) => `  - figure: ${f.description}`);
        return [`[${e.id}] (${e.section}) ${e.title}`, e.summary, ...figures].join("\n");
      })
      .join("\n\n");
  }
