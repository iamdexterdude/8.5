"""Draws the 8.5 icons: the number 8.5 in soft cobalt with a turquoise point, on ink. Run: python tools/make-icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent.parent / "app" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
INK, COBALT, TURQ = (11, 17, 32), (143, 174, 255), (62, 207, 200)
FONTS = ["C:/Windows/Fonts/bahnschrift.ttf", "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]

def font(px):
    for f in FONTS:
        try:
            ft = ImageFont.truetype(f, px)
            try: ft.set_variation_by_axes([700, 100])  # Bahnschrift: weight 700, normal width
            except Exception: pass
            return ft
        except Exception: continue
    return ImageFont.load_default()

def draw(size, rounded=True, safe=1.0):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22) if rounded else 0, fill=INK)
    px = int(S * 0.50 * safe); f = font(px)
    parts = [("8", COBALT), (".", TURQ), ("5", COBALT)]
    widths = [d.textlength(t, font=f) for t, _ in parts]
    # tighten the point so "8.5" reads as one mark
    widths[1] *= 0.85
    total = sum(widths)
    x = (S - total) / 2
    bbox = d.textbbox((0, 0), "8", font=f); h = bbox[3] - bbox[1]
    y = (S - h) / 2 - bbox[1]
    for (t, col), w in zip(parts, widths):
        d.text((x, y), t, font=f, fill=col); x += w
    return img.resize((size, size), Image.LANCZOS)

draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, rounded=False, safe=0.78).save(OUT / "maskable-512.png")
draw(180, rounded=False).save(OUT / "apple-touch-icon.png")
draw(32).save(OUT / "favicon-32.png")
(OUT / "icon.svg").write_text("""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0B1120"/>
<text x="50" y="66" text-anchor="middle" font-family="Bahnschrift, 'Segoe UI', system-ui, sans-serif" font-weight="700" font-size="50" letter-spacing="-2"><tspan fill="#8FAEFF">8</tspan><tspan fill="#3ECFC8">.</tspan><tspan fill="#8FAEFF">5</tspan></text></svg>""", encoding="utf-8")
print("icons written to", OUT)
