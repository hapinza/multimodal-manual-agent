"""Render every PDF page in files/ to a PNG so both Claude and the UI can see diagrams."""
import io
from pathlib import Path

import pymupdf
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "files"
OUT = ROOT / "knowledge" / "pages"
DPI = 150

DOCS = {
    "owner-manual.pdf": "manual",
    "quick-start-guide.pdf": "quickstart",
    "selection-chart.pdf": "selection",
}


def trim_white(image: Image.Image) -> Image.Image:
    """Crop away the white margin around the content."""
    rgb = image.convert("RGB")
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, (255, 255, 255)))
    box = diff.convert("L").point(lambda v: 255 if v > 20 else 0).getbbox()
    return rgb.crop(box) if box else rgb


def render_selection_chart(doc: pymupdf.Document, out: Path) -> None:
    """The selection chart is one low-res JPEG on a huge square page with blank space above and below.
    Rendering the page would upscale it (blurry, 2500px); instead take the embedded image and trim it."""
    xref = doc[0].get_images()[0][0]
    image = Image.open(io.BytesIO(doc.extract_image(xref)["image"]))
    trim_white(image).save(out)


OUT.mkdir(parents=True, exist_ok=True)
for filename, prefix in DOCS.items():
    doc = pymupdf.open(SRC / filename)
    for i, page in enumerate(doc, start=1):
        out = OUT / f"{prefix}-{i:02d}.png"
        if prefix == "selection":
            render_selection_chart(doc, out)
        else:
            page.get_pixmap(dpi=DPI).save(out)
    print(f"{filename}: {len(doc)} pages -> {OUT}")