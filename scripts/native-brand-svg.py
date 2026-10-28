"""Build the VELA app-icon / splash SVGs (text converted to paths, so the
SVGs render identically everywhere without the font installed).

Usage (only needed when the brand changes; the SVGs are committed):
  curl -L -o /tmp/fraunces.ttf "https://github.com/google/fonts/raw/main/ofl/fraunces/Fraunces%5BSOFT,WONK,opsz,wght%5D.ttf"
  python3 scripts/native-brand-svg.py /tmp/fraunces.ttf
Requires: pip install fonttools
Font: Fraunces (SIL Open Font License), the app's display font.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

BG, PAPER, EMBER = "#12100E", "#F3EEE6", "#E4572E"
font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 560, "opsz": 144, "SOFT": 0, "WONK": 0})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
TRACK = 40  # extra letter spacing in font units


def wordmark(text="VELA"):
    """Path data + bounds in font units (y flipped to SVG orientation)."""
    pen = SVGPathPen(gs)
    bounds = BoundsPen(gs)
    x = 0
    for ch in text:
        name = cmap[ord(ch)]
        t = (1, 0, 0, -1, x, 0)
        gs[name].draw(TransformPen(pen, t))
        gs[name].draw(TransformPen(bounds, t))
        x += gs[name].width + TRACK
    return pen.getCommands(), bounds.bounds


def spark(cx, cy, r):
    """Four-point spark, same shape as public/favicon.svg."""
    k = r * 0.36
    return (f"M{cx},{cy - r} L{cx + k},{cy - k} L{cx + r},{cy} L{cx + k},{cy + k} "
            f"L{cx},{cy + r} L{cx - k},{cy + k} L{cx - r},{cy} L{cx - k},{cy - k} Z")


def compose(size, width_ratio, background=True):
    d, (x0, y0, x1, y1) = wordmark()
    w, h = x1 - x0, y1 - y0
    scale = size * width_ratio / w
    tx = (size - w * scale) / 2 - x0 * scale
    ty = (size - h * scale) / 2 - y0 * scale
    sr = h * scale * 0.22
    sx = tx + x1 * scale + sr * 0.6
    sy = ty + y0 * scale - sr * 0.2
    bg = f'<rect width="{size}" height="{size}" fill="{BG}"/>' if background else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">'
            f'{bg}<path fill="{PAPER}" transform="translate({tx:.2f} {ty:.2f}) scale({scale:.5f})" d="{d}"/>'
            f'<path fill="{EMBER}" d="{spark(round(sx, 2), round(sy, 2), round(sr, 2))}"/></svg>\n')


out = "resources/"
open(out + "icon.svg", "w").write(compose(1024, 0.66))
# Android adaptive foreground: content must sit in the inner 66% safe zone.
open(out + "icon-foreground.svg", "w").write(compose(432, 0.44, background=False))
open(out + "splash.svg", "w").write(compose(2732, 0.28))
print("wrote resources/icon.svg, icon-foreground.svg, splash.svg")
