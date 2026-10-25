"""After the first PDF pass: find the page of every ⟦marker⟧ and write build/toc_pages.json for the second pass."""
import json, re, sys
import pymupdf
from common import COURSE
pdf = sys.argv[1]
doc = pymupdf.open(pdf)
pages = {}
for i, page in enumerate(doc):
    for m in re.finditer(r"⟦([A-Z0-9-]+)⟧", page.get_text()):
        pages.setdefault(m.group(1), i + 1)
(COURSE / "speaking" / "build" / "toc_pages.json").write_text(json.dumps(pages, indent=0), encoding="utf-8")
print(len(pages), "markers over", len(doc), "pages")
