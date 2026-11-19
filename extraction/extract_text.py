"""Save each page's extractable text so the agent can quote exact numbers and wording."""
import json
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
DOCS = {
    "owner-manual.pdf": "manual",
    "quick-start-guide.pdf": "quickstart",
    "selection-chart.pdf": "selection",
}

texts = {}
for filename, prefix in DOCS.items():
    for i, page in enumerate(pymupdf.open(ROOT / "files" / filename), start=1):
        texts[f"{prefix}-{i:02d}"] = page.get_text().strip()

out = ROOT / "knowledge" / "page_text.json"
out.write_text(json.dumps(texts, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"{len(texts)} pages -> {out}")