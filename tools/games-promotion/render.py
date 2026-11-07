#!/usr/bin/env python3
"""Render approved MealDeck artwork and verified game states into shareable assets.

Run create-manifest.ts first. Requires Pillow and ffmpeg; no remote services or AI
assets are used. Fonts are vendored with their original SIL Open Font Licenses.
These are labelled game previews, not recordings or claimed customer results.
"""
from functools import lru_cache
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DATA = json.loads((HERE / "manifest.json").read_text())
CREAM, PAPER, INK = "#fff6e8", "#fffdf7", "#111111"
RED, DEEP, MUTED, LINE, YELLOW = "#d5141d", "#951018", "#655c52", "#ddcbb0", "#ffe5a4"
LOGO = Image.open(ROOT / "src/assets/approved-logos/mealdeck.webp").convert("RGBA")
FOODS = {key: Image.open(ROOT / f"src/assets/card-suit-{key}.png").convert("RGBA")
         for key in ["burger", "chicken", "french-taco", "fries", "cake", "drink", "paratha"]}


@lru_cache(maxsize=80)
def font(size, weight=700, body=False):
    result = ImageFont.truetype(str(HERE / "fonts" / ("DMSans.ttf" if body else "Outfit.ttf")), size)
    result.set_variation_by_axes([14, weight] if body else [weight])
    return result


def paste_fit(image, asset, bounds):
    x, y, width, height = bounds
    fitted = asset.copy()
    fitted.thumbnail((width, height), Image.Resampling.LANCZOS)
    image.paste(fitted, (round(x + (width - fitted.width) / 2), round(y + (height - fitted.height) / 2)), fitted)


def label(draw, text, xy, size, colour=INK, weight=700, body=False, anchor=None):
    draw.text(xy, text, fill=colour, font=font(size, weight, body), anchor=anchor)


def wrap(draw, text, width, size, weight=700, body=False):
    lines, line = [], ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if line and draw.textlength(candidate, font=font(size, weight, body)) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    return [*lines, line]


def paragraph(draw, text, x, y, width, size, colour=MUTED, weight=500, body=True, line_height=None):
    step = line_height or round(size * 1.4)
    for line in wrap(draw, text, width, size, weight, body):
        label(draw, line, (x, y), size, colour, weight, body)
        y += step
    return y


def og_preview(game):
    image = Image.new("RGB", (1200, 630), CREAM)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((22, 22, 1178, 608), 30, outline=INK, width=3)
    draw.rounded_rectangle((52, 49, 273, 93), 22, fill=RED)
    label(draw, "MEALDECK PLAY", (162, 71), 21, PAPER, 800, anchor="mm")
    label(draw, game["category"].upper(), (58, 118), 19, MUTED, 700, True)
    size = 80
    lines = wrap(draw, game["name"], 674, size, 900)
    while len(lines) > 2:
        size -= 4
        lines = wrap(draw, game["name"], 674, size, 900)
    y = 160
    for line in lines:
        label(draw, line, (52, y), size, INK, 900)
        y += int(size * 1.08)
    paragraph(draw, game["description"], 57, y + 24, 635, 28)
    draw.rounded_rectangle((58, 481, 318, 540), 18, fill=RED)
    label(draw, "PLAY FREE  →", (188, 510), 26, PAPER, 800, anchor="mm")
    label(draw, "mealdeck.co.uk/play", (57, 563), 22, INK, 600, True)
    draw.rounded_rectangle((769, 61, 1120, 539), 30, fill=DEEP)
    draw.rounded_rectangle((744, 48, 1097, 526), 30, fill=PAPER, outline=INK, width=3)
    paste_fit(image, LOGO, (830, 63, 180, 182))
    paste_fit(image, FOODS[game["art"]], (802, 224, 237, 237))
    label(draw, "YOUR NEXT LITTLE BREAK", (920, 488), 15, MUTED, 700, True, "mm")
    label(draw, "Free food games · No account needed", (793, 570), 18, INK, 500, True)
    return image


def video_base(game, step):
    image = Image.new("RGB", (720, 1280), CREAM)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((24, 32, 696, 1248), 30, outline=INK, width=2)
    paste_fit(image, LOGO, (49, 65, 154, 156))
    label(draw, "MEALDECK", (239, 109), 38, INK, 900)
    label(draw, "PLAY", (239, 151), 38, RED, 900)
    draw.rounded_rectangle((487, 108, 654, 148), 20, fill=PAPER, outline=LINE, width=2)
    label(draw, "GAME PREVIEW", (570, 128), 16, MUTED, 700, True, "mm")
    label(draw, game["name"], (360, 279), 58, INK, 900, anchor="mm")
    paragraph(draw, step, 73, 326, 576, 25, MUTED, 500, True, 34)
    label(draw, "FREE TO PLAY · NO ACCOUNT NEEDED", (360, 1105), 19, MUTED, 700, True, "mm")
    draw.rounded_rectangle((75, 1140, 645, 1204), 20, fill=RED)
    label(draw, "mealdeck.co.uk/play", (360, 1172), 29, PAPER, 800, anchor="mm")
    return image


def snack_frame(game, state):
    image = video_base(game, "Collect the bites. Keep your tail out of trouble.")
    draw = ImageDraw.Draw(image)
    origin_x, origin_y, cell = 85, 461, 55
    draw.rounded_rectangle((70, 446, 650, 1026), 24, fill=INK)
    for index in range(100):
        x, y = origin_x + index % 10 * cell, origin_y + index // 10 * cell
        draw.rounded_rectangle((x + 2, y + 2, x + cell - 2, y + cell - 2), 7, fill=PAPER)
        if index in state["snake"]:
            head = index == state["snake"][0]
            draw.rounded_rectangle((x + 3, y + 3, x + cell - 3, y + cell - 3), 10, fill=RED if head else DEEP)
            if head:
                draw.ellipse((x + 15, y + 15, x + 21, y + 21), fill=PAPER)
                draw.ellipse((x + 33, y + 15, x + 39, y + 21), fill=PAPER)
        elif index == state["food"]:
            paste_fit(image, FOODS["burger"], (x + 5, y + 5, cell - 10, cell - 10))
    label(draw, f"Bites collected: {state['score']}", (360, 420), 25, INK, 700, True, "mm")
    return image


def skewer_frame(game, state, previous=None):
    image = video_base(game, "Move the top bite. Match every skewer.")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((65, 448, 655, 1013), 28, fill=INK)
    foods = ["burger", "chicken", "french-taco", "cake"]
    for index, skewer in enumerate(state["skewers"]):
        x = 79 + index * 114
        changed = previous is not None and previous["skewers"][index] != skewer
        draw.rounded_rectangle((x, 472, x + 106, 960), 18, fill=PAPER, outline=YELLOW if changed else LINE, width=5 if changed else 2)
        draw.rounded_rectangle((x + 49, 506, x + 57, 930), 4, fill=LINE)
        for pos, food in enumerate(skewer):
            y = 806 - pos * 139
            draw.rounded_rectangle((x + 9, y, x + 97, y + 118), 14, fill=CREAM, outline=LINE, width=2)
            paste_fit(image, FOODS[foods[food]], (x + 14, y + 15, 78, 88))
        label(draw, str(index + 1), (x + 53, 984), 21, PAPER, 700, anchor="mm")
    label(draw, f"Moves: {state['moves']}", (360, 420), 25, INK, 700, True, "mm")
    return image


def pantry_frame(game, state):
    image = video_base(game, "Read the clues. Flag chillies. Clear the shelves.")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((65, 448, 655, 1038), 28, fill=INK)
    for index, cell_view in enumerate(state["cells"]):
        x, y = 82 + index % 5 * 112, 465 + index // 5 * 112
        kind = cell_view["kind"]
        draw.rounded_rectangle((x, y, x + 106, y + 106), 14, fill=CREAM if kind == "safe" else DEEP, outline=LINE, width=2)
        if kind == "safe" and cell_view["adjacent"]:
            label(draw, str(cell_view["adjacent"]), (x + 53, y + 52), 51, INK, 800, anchor="mm")
        elif kind in ("flagged", "chilli"):
            draw.line((x + 35, y + 28, x + 35, y + 80), fill=PAPER, width=5)
            draw.polygon([(x + 38, y + 28), (x + 77, y + 43), (x + 38, y + 57)], fill=YELLOW)
        elif kind == "covered":
            label(draw, "?", (x + 53, y + 52), 42, PAPER, 700, anchor="mm")
    label(draw, f"Safe shelves opened: {state['opened']}", (360, 420), 25, INK, 700, True, "mm")
    return image


def end_frame(game, qr):
    image = video_base(game, "Your turn. Tap the link or scan to play.")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((71, 454, 649, 1035), 28, fill=PAPER, outline=INK, width=3)
    label(draw, "Fancy a quick game?", (360, 512), 38, INK, 800, anchor="mm")
    modules, scale = qr["qrSize"], 8
    size = (modules + 8) * scale
    x, y = (720 - size) // 2, 585
    draw.rectangle((x, y, x + size - 1, y + size - 1), fill="#ffffff")
    for row in range(modules):
        for col in range(modules):
            if qr["qr"][row * modules + col]:
                px, py = x + (col + 4) * scale, y + (row + 4) * scale
                draw.rectangle((px, py, px + scale - 1, py + scale - 1), fill="#000000")
    label(draw, "SCAN TO PLAY FREE", (360, 978), 23, RED, 800, anchor="mm")
    return image


def render_clip(game, qr, output):
    key = {"snack-trail": "snack", "skewer-sort": "skewer", "pantry-sweep": "pantry"}[game["id"]]
    states = DATA[key]
    render = {"snack": snack_frame, "skewer": skewer_frame, "pantry": pantry_frame}[key]
    with tempfile.TemporaryDirectory(prefix="mealdeck-promo-") as temp:
        folder = Path(temp)
        frames = []
        for index, state in enumerate(states):
            frame = render(game, state, states[index - 1] if index else None) if key == "skewer" else render(game, state)
            path = folder / f"{index:03d}.png"
            frame.save(path)
            frames.append((path, 1.0 if index == 0 else 7.0 / (len(states) - 1)))
            if index == 0:
                frame.save(output / f"{game['id']}.png", optimize=True)
        ending = folder / "ending.png"
        end_frame(game, qr).save(ending)
        frames.append((ending, 3.0))
        playlist = folder / "frames.txt"
        playlist.write_text("".join(f"file '{path.name}'\nduration {duration:.8f}\n" for path, duration in frames) + f"file '{ending.name}'\n")
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(playlist),
            "-vf", "fps=24", "-t", "11", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
            "-movflags", "+faststart", "-an", str(output / f"{game['id']}.mp4"),
        ], check=True)


def main():
    previews = ROOT / "public/game-previews"
    clips = ROOT / "public/game-promos"
    previews.mkdir(parents=True, exist_ok=True)
    clips.mkdir(parents=True, exist_ok=True)
    for game in DATA["games"]:
        og_preview(game).save(previews / f"{game['id']}.png", optimize=True)
    for qr in DATA["clips"]:
        game = next(game for game in DATA["games"] if game["id"] == qr["id"])
        render_clip(game, qr, clips)
        print(f"Rendered {game['name']}: 720×1280, 11 seconds, captioned game preview.", flush=True)
    print(f"Rendered {len(DATA['games'])} static Open Graph images at 1200×630.", flush=True)


if __name__ == "__main__":
    main()
