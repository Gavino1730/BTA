from PIL import Image, ImageDraw, ImageFont
import os

BG       = "#0f1b2d"   # dark navy — same for all
ORANGE   = "#e8571a"   # basketball orange
BLUE     = "#4a9fe8"   # accent blue
WHITE    = "#ffffff"
SEAM     = "#0f1b2d"   # seam color matches bg for clean look
SIZE     = 180
RADIUS   = 38

def try_font(size):
    for path in [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()

def new_canvas():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SIZE-1, SIZE-1], radius=RADIUS, fill=BG)
    return img, d

def draw_basketball(d, cx, cy, r):
    w = max(3, r // 12)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=ORANGE, outline=SEAM, width=w)
    # vertical seam
    d.line([cx, cy-r, cx, cy+r], fill=SEAM, width=w)
    # horizontal seam arcs
    sh = r // 3
    d.arc([cx-r, cy-sh, cx+r, cy+sh], start=0, end=180, fill=SEAM, width=w)
    d.arc([cx-r, cy-sh, cx+r, cy+sh], start=180, end=360, fill=SEAM, width=w)

def add_label(d, text, font_size=26):
    font = try_font(font_size)
    # subtle pill behind text
    bbox = d.textbbox((SIZE//2, SIZE-28), text, font=font, anchor="mm")
    pad = 6
    d.rounded_rectangle([bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad],
                         radius=8, fill="#1e3352")
    d.text((SIZE//2, SIZE-28), text, fill=WHITE, font=font, anchor="mm")

# Generates icons for the two active frontends in this repo:
# coach dashboard and iPad operator.

# ── DASHBOARD ────────────────────────────────────────────────────
img, d = new_canvas()
draw_basketball(d, cx=90, cy=72, r=44)
# Clipboard / play diagram
d.rounded_rectangle([30, 120, 150, 148], radius=6, fill="#1e3352", outline=BLUE, width=2)
# Three "play lines" suggesting X's and O's diagram
for i, (x1, x2) in enumerate([(38, 80), (38, 65), (90, 130)]):
    y = 128 + i * 7
    d.rectangle([x1, y, x2, y+3], fill=BLUE)
# Two dots (players)
d.ellipse([110, 126, 118, 134], fill=ORANGE)
d.ellipse([130, 132, 138, 140], fill=WHITE)
add_label(d, "DASHBOARD", font_size=22)
os.makedirs("apps/coach-dashboard/public", exist_ok=True)
img.save("apps/coach-dashboard/public/apple-touch-icon.png")
print("Dashboard icon saved")

# ── OPERATOR ─────────────────────────────────────────────────────
img, d = new_canvas()
draw_basketball(d, cx=90, cy=72, r=44)
# Input pad / number pad
d.rounded_rectangle([28, 118, 152, 150], radius=6, fill="#1e3352", outline=BLUE, width=2)
for row in range(2):
    for col in range(4):
        x = 36 + col * 28
        y = 124 + row * 13
        d.rounded_rectangle([x, y, x+22, y+9], radius=3, fill=BLUE)
add_label(d, "OPERATOR", font_size=22)
os.makedirs("apps/ipad-operator/public", exist_ok=True)
img.save("apps/ipad-operator/public/apple-touch-icon.png")
print("Operator icon saved")

print("All icons generated!")
