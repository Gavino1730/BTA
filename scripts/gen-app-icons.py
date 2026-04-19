"""Generate dark-background apple-touch-icons for coach-dashboard and ipad-operator."""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 180
BG_COLOR = (15, 15, 20)
ACCENT_COLOR = (100, 200, 240)
WHITE = (255, 255, 255)
ICON_RATIO = 0.72   # fraction of canvas for the BTA mark
FONT_SIZE = 26      # text size in px

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
branding_icon = os.path.join(ROOT, "branding", "icon.png")


def make_icon(label: str, output_path: str):
    img = Image.new("RGB", (SIZE, SIZE), BG_COLOR)
    draw = ImageDraw.Draw(img)

    # Paste the BTA triangular mark scaled to ICON_RATIO of canvas, top-biased
    mark = Image.open(branding_icon).convert("RGBA")
    icon_size = int(SIZE * ICON_RATIO)
    mark = mark.resize((icon_size, icon_size), Image.LANCZOS)
    x = (SIZE - icon_size) // 2
    y = int(SIZE * 0.02)
    img.paste(mark, (x, y), mark)

    # Load a bold system font, fall back to default
    font = None
    font_size = FONT_SIZE
    for candidate in [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf",
    ]:
        if os.path.exists(candidate):
            try:
                font = ImageFont.truetype(candidate, font_size)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    label_upper = label.upper()
    bbox = draw.textbbox((0, 0), label_upper, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (SIZE - text_w) // 2
    icon_bottom = int(SIZE * 0.02) + int(SIZE * ICON_RATIO)
    text_y = icon_bottom + 6

    # Cyan underline accent
    underline_y = text_y + text_h + 4
    draw.rectangle(
        [text_x, underline_y, text_x + text_w, underline_y + 2],
        fill=ACCENT_COLOR,
    )

    draw.text((text_x, text_y), label_upper, font=font, fill=WHITE)
    img.save(output_path)
    print(f"Written: {output_path}")


make_icon(
    "DASHBOARD",
    os.path.join(ROOT, "apps", "coach-dashboard", "public", "apple-touch-icon.png"),
)
make_icon(
    "OPERATOR",
    os.path.join(ROOT, "apps", "ipad-operator", "public", "apple-touch-icon.png"),
)
print("Done.")
