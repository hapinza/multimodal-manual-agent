"""Build the page catalog: one short, searchable entry per page, written by Claude vision.

The catalog goes into the agent's system prompt so it always knows which page covers what.
Re-running is safe: pages already in catalog.json are skipped.
"""
import base64
import json
import os
import sys
from pathlib import Path

import anthropic
import pymupdf
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / "knowledge" / "pages"
OUT = ROOT / "knowledge" / "catalog.json"
MODEL = "claude-opus-5-5"  # one-time job: use the most accurate model

load_dotenv(ROOT / ".env")
client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

SOURCES = {
    "manual": ("owner-manual.pdf", "Owner's Manual"),
    "quickstart": ("quick-start-guide.pdf", "Quick Start Guide"),
    "selection": ("selection-chart.pdf", "Welding Process Selection Chart"),
}

# Structured outputs: the API guarantees the reply is JSON matching this schema.
PAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short title of what this page covers."},
        "section": {
            "type": "string",
            "enum": [
                "Front Matter", "Safety", "Specifications", "Controls",
                "MIG / Flux-Cored Wire Welding", "TIG / Stick Welding", "Welding Tips",
                "Maintenance", "Parts List and Diagram", "Warranty",
                "Quick Start Guide", "Process Selection Chart",
            ],
            "description": "Section from the manual's table of contents; use the last two for the other documents.",
        },
        "summary": {
            "type": "string",
            "description": "2-4 sentences: what a user could learn from this page. "
            "Include facts that appear ONLY in images (labels, socket names, chart values).",
        },
        "figures": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "kind": {"type": "string", "enum": ["diagram", "photo", "table", "chart", "schematic"]},
                    "worth_showing": {
                        "type": "boolean",
                        "description": "True if showing this figure would help a beginner more than words.",
                    },
                },
                "required": ["description", "kind", "worth_showing"],
                "additionalProperties": False,
            },
        },
        "keywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "section", "summary", "figures", "keywords"],
    "additionalProperties": False,
}

PROMPT = """This is page {page} of the {doc_title} for the Vulcan OmniPro 220 multiprocess welder.
The page's extractable text is below (it may be empty or scrambled; trust the image when they disagree).

<page_text>
{text}
</page_text>

Write a catalog entry so an assistant can later decide whether this page answers a user's question.
Be specific: name processes (MIG, Flux-Cored, TIG, Stick), voltages, sockets, and values you can see."""


def page_text(prefix: str, page: int) -> str:
    pdf_name = SOURCES[prefix][0]
    return pymupdf.open(ROOT / "files" / pdf_name)[page - 1].get_text().strip()


def describe(png: Path) -> dict:
    prefix, num = png.stem.rsplit("-", 1)
    page = int(num)
    image_b64 = base64.standard_b64encode(png.read_bytes()).decode()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        output_config={"format": {"type": "json_schema", "schema": PAGE_SCHEMA}},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
                {"type": "text", "text": PROMPT.format(page=page, doc_title=SOURCES[prefix][1], text=page_text(prefix, page))},
            ],
        }],
    )
    text = next(block.text for block in response.content if block.type == "text")
    entry = json.loads(text)
    return {"id": png.stem, "doc": prefix, "page": page, **entry}


def main() -> None:
    only = set(sys.argv[1:])  # optional: build just some pages, e.g. manual-24 selection-01
    catalog = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for png in sorted(PAGES.glob("*.png")):
        if (only and png.stem not in only) or png.stem in catalog:
            continue
        print(f"describing {png.stem} ...", flush=True)
        catalog[png.stem] = describe(png)
        OUT.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")  # save after every page
    print(f"done: {len(catalog)} entries -> {OUT}")


if __name__ == "__main__":
    main()