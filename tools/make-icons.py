"""Draws the Eight icons: two stacked rings (an 8) in cobalt and turquoise on ink. Run: python tools/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent.parent / "app" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
INK, COBALT, TURQ, WARM = (11, 17, 32), (143, 174, 255), (62, 207, 200), (244, 241, 232)

def draw(size, rounded=True, safe=1.0):
    S = size * 4                      # draw big, shrink for smooth edges
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * 0.22) if rounded else 0
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=INK)
    # two rings that overlap slightly, centred
    ring = S * 0.27 * safe            # ring radius
    w = int(S * 0.075 * safe)         # stroke
    cx, cy = S / 2, S / 2
    top = (cx, cy - ring * 0.93); bot = (cx, cy + ring * 0.93)
    for (x, y), col in ((top, COBALT), (bot, TURQ)):
        d.ellipse([x - ring, y - ring, x + ring, y + ring], outline=col, width=w)
    # a warm-white dot where the rings meet
    dot = S * 0.028 * safe
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=WARM)
    return img.resize((size, size), Image.LANCZOS)

draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, rounded=False, safe=0.78).save(OUT / "maskable-512.png")   # full bleed, content inside the safe zone
draw(180, rounded=False).save(OUT / "apple-touch-icon.png")
draw(32).save(OUT / "favicon-32.png")

(OUT / "icon.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0B1120"/>
<circle cx="50" cy="37.5" r="27" fill="none" stroke="#8FAEFF" stroke-width="7.5"/><circle cx="50" cy="62.5" r="27" fill="none" stroke="#3ECFC8" stroke-width="7.5"/><circle cx="50" cy="50" r="2.8" fill="#F4F1E8"/></svg>""", encoding="utf-8")
print("icons written to", OUT)
