#!/usr/bin/env python3
"""Cosmic Atlas app icon: a point-cloud spiral galaxy, drawn the way the atlas draws its catalog, over the app's own
dark background, with two faint observer-centred reference rings behind it. Deterministic; writes the single
1024x1024 PNG the asset catalog references (iOS derives the dark and tinted appearances and the glass treatment).

    python3 native/App/Icon/make_icon.py
"""
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 1024
OUT = Path(__file__).resolve().parents[1] / "CosmicAtlas/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
rng = np.random.default_rng(20260916)

# Background: the app's clear colour (6, 9, 13) lifted toward deep navy around the centre.
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
d = np.sqrt(((xx - S * 0.5) / S) ** 2 + ((yy - S * 0.46) / S) ** 2)
t = np.clip(1 - d / 0.78, 0, 1) ** 1.5
base, lift = np.array([6, 9, 13], np.float32), np.array([20, 34, 56], np.float32)
out = base + (lift - base) * t[..., None]

# Reference rings (the lookback / CMB shell idea), thin and faint, behind the galaxy.
rings = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(rings)
for radius, alpha, width in ((0.455, 120, 5), (0.34, 64, 4)):
    r = radius * S
    draw.ellipse((S * 0.5 - r, S * 0.5 - r, S * 0.5 + r, S * 0.5 + r), outline=(79, 156, 184, alpha), width=width)
rings = rings.filter(ImageFilter.GaussianBlur(1.2))

# Galaxy points: exponential disk with two logarithmic arms, a warm bulge, inclined and rotated for depth.
N = 14000
kinds = rng.choice(3, size=N, p=(0.16, 0.20, 0.64))  # bulge, smooth disk, arms
re, rmax = 0.105 * S, 0.37 * S
r = np.where(kinds == 0, np.abs(rng.normal(0, 0.042 * S, N)), np.minimum(rng.exponential(re, N) + 0.05 * S, rmax))
pitch = math.radians(24)
theta = rng.uniform(0, 2 * math.pi, N)
arm = rng.integers(0, 2, N)
arm_theta = arm * math.pi + np.log(np.maximum(r, 1) / (0.03 * S)) / math.tan(pitch)
scatter = rng.normal(0, 0.11, N) * (0.5 + r / rmax)
theta = np.where(kinds == 2, arm_theta + scatter, theta)
x, y = r * np.cos(theta), r * np.sin(theta)
z = rng.normal(0, 0.012 * S, N) * (1 + (kinds == 0) * 2.5)
incl, roll = math.radians(56), math.radians(-34)
yp = y * math.cos(incl) + z * math.sin(incl)
xr, yr = x * math.cos(roll) - yp * math.sin(roll), x * math.sin(roll) + yp * math.cos(roll)
cx, cy = S * 0.5, S * 0.5
px, py = cx + xr, cy + yr

# Colour and brightness: warm bulge, pale-blue disk (the catalog point colour), bright young knots on the arms.
disk = np.array([186, 209, 230], np.float32)
bulge = np.array([255, 236, 205], np.float32)
knot = np.array([214, 240, 252], np.float32)
knots = (kinds == 2) & (rng.uniform(0, 1, N) < 0.18) & (r > 0.12 * S)
color = np.where((kinds == 0)[:, None], bulge, disk)
color = np.where(knots[:, None], knot, color)
falloff = np.exp(-r / (0.28 * S))
size = np.where(kinds == 0, rng.uniform(1.1, 2.2, N), rng.uniform(1.3, 3.0, N)) * (0.8 + 0.4 * falloff)
size = np.where(knots, size * 1.6, size)
alpha = np.clip((0.28 + 0.5 * falloff) * rng.uniform(0.5, 1, N), 0, 1)
alpha = np.where(knots, np.minimum(1, alpha * 1.3), alpha)

light = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(light)
order = np.argsort(size)
for i in order:
    s, a = float(size[i]), int(255 * alpha[i])
    c = tuple(int(v) for v in color[i])
    draw.ellipse((px[i] - s, py[i] - s, px[i] + s, py[i] + s), fill=c + (a,))
light = light.filter(ImageFilter.GaussianBlur(0.6))
glow = light.filter(ImageFilter.GaussianBlur(26))

# Central bulge glow, soft and warm.
core = np.exp(-(((xx - cx) / (0.07 * S)) ** 2 + ((yy - cy) / (0.045 * S)) ** 2)) * 0.32
core_col = np.array([255, 226, 186], np.float32)

def add(layer, gain):
    global out
    arr = np.asarray(layer).astype(np.float32)
    a = arr[..., 3:4] / 255 * gain
    out = out + arr[..., :3] * a

add(rings, 1.0)
add(glow, 0.5)
out = out + core_col * core[..., None]
add(light, 1.0)
out = np.clip(out, 0, 255).astype(np.uint8)
OUT.parent.mkdir(parents=True, exist_ok=True)
Image.fromarray(out, "RGB").save(OUT, optimize=True)
print("wrote", OUT)
