"""Build fixed thermal derivatives from the complete approved brand artwork.

No cropping, redrawing, runtime URL, receipt fields or dynamic image input.
The approved manifest's dimensions and RGBA hash are verified before conversion.
Output is JSON for the companion Node catalogue generator; this script writes
no source file and changes none of the approved originals.
"""

from base64 import b64encode
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json

from PIL import Image


root = Path(__file__).resolve().parents[2]
source_dir = root / "src/assets/approved-logos"
manifest = json.loads((source_dir / "manifest.json").read_text())
logo_ids = ("skorch", "tavo-chicken", "loadd", "moktl", "souvano")
result = {}

for logo_id in logo_ids:
    approved = next(row for row in manifest["logos"] if row["id"] == logo_id)
    image = Image.open(source_dir / (logo_id + ".webp")).convert("RGBA")
    assert image.size == (approved["width"], approved["height"])
    assert sha256(image.tobytes()).hexdigest() == approved["rgba_sha256"]

    # Fit the complete approved canvas inside 288 x 240 dots. Preserve padding
    # and the aspect ratio; the sole rounding is to whole thermal-printer dots.
    scale = min(288 / image.width, 240 / image.height)
    width, height = round(image.width * scale), round(image.height * scale)
    white = Image.new("RGBA", image.size, "white")
    white.alpha_composite(image)
    grey = white.convert("L").resize((width, height), Image.Resampling.LANCZOS)
    mono = grey.point(lambda value: 0 if value < 180 else 255, mode="1")
    row_bytes = (width + 7) // 8
    raster = bytearray(value ^ 255 for value in mono.tobytes())
    # ESC/POS bit 1 is black. Padding beyond the right edge must stay white.
    if width % 8:
        mask = (0xFF << (8 - width % 8)) & 0xFF
        for y in range(height):
            raster[y * row_bytes + row_bytes - 1] &= mask
    assert len(raster) == row_bytes * height

    # An exact SVG of those same monochrome pixels makes browser printing
    # synchronous, with no remote artwork or image-load timing dependency.
    paths = []
    for y in range(height):
        x = 0
        while x < width:
            if mono.getpixel((x, y)) != 0:
                x += 1
                continue
            start = x
            while x < width and mono.getpixel((x, y)) == 0:
                x += 1
            length = x - start
            paths.append(f"M{start} {y}h{length}v1h-{length}z")
    png = BytesIO()
    mono.save(png, format="PNG", optimize=False, compress_level=9)
    result[logo_id] = {
        "width": width,
        "height": height,
        "rowBytes": row_bytes,
        "sourceRgbaSha256": approved["rgba_sha256"],
        "rasterSha256": sha256(raster).hexdigest(),
        "rasterBase64": b64encode(raster).decode("ascii"),
        "pngBase64": b64encode(png.getvalue()).decode("ascii"),
        "svgPath": "".join(paths),
        "viewBoxWidth": width,
        "viewBoxHeight": height,
    }

print(json.dumps(result))
