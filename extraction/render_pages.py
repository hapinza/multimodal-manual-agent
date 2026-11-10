"""Render every PDF page in files/ to a PNG so both Claude and the UI can see diagrams."""
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "files"
OUT = ROOT / "knowledge" / "pages"
DPI = 150

DOCS = {
    "owner-manual.pdf": "manual",
    "quick-start-guide.pdf": "quickstart",
    "selection-chart.pdf": "selection",
}

OUT.mkdir(parents=True, exist_ok=True)
for filename, prefix in DOCS.items():
    doc = pymupdf.open(SRC / filename)
    for i, page in enumerate(doc, start=1):
        out = OUT / f"{prefix}-{i:02d}.png"
        page.get_pixmap(dpi=DPI).save(out)
    print(f"{filename}: {len(doc)} pages -> {OUT}")
 