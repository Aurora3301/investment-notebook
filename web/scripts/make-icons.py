#!/usr/bin/env python3
"""Draw the app icon without third-party image libraries."""

import os
import struct
import zlib

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUBLIC = os.path.join(ROOT, "public")
ICONSET = os.path.abspath(
    os.path.join(ROOT, "..", "ios", "InvestmentNotebook", "Assets.xcassets", "AppIcon.appiconset")
)


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path: str, size: int, pixels: list[bytearray]) -> None:
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        raw.extend(row)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)


def inside_round(x: int, y: int, left: int, top: int, right: int, bottom: int, radius: int) -> bool:
    if x < left or y < top or x >= right or y >= bottom:
        return False
    cx = cy = None
    if x < left + radius and y < top + radius:
        cx, cy = left + radius, top + radius
    elif x >= right - radius and y < top + radius:
        cx, cy = right - radius - 1, top + radius
    elif x < left + radius and y >= bottom - radius:
        cx, cy = left + radius, bottom - radius - 1
    elif x >= right - radius and y >= bottom - radius:
        cx, cy = right - radius - 1, bottom - radius - 1
    if cx is None:
        return True
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= radius * radius


def render(size: int) -> list[bytearray]:
    pine = (27, 94, 69)
    cream = (251, 248, 243)
    gold = (176, 137, 62)
    line = (214, 198, 178)
    rows: list[bytearray] = []
    margin = int(size * 0.16)
    radius = int(size * 0.08)
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if not inside_round(x, y, margin, margin, size - margin, size - margin, radius):
                row.extend(pine)
                continue
            color = cream
            top = int(size * 0.40)
            bottom = int(size * 0.74)
            gap = max(1, int(size * 0.065))
            if top < y < bottom and (y - top) % gap < max(2, size // 90) and int(size * 0.30) < x < int(size * 0.74):
                color = line
            base = int(size * 0.70)
            bar_w = max(2, int(size * 0.065))
            gap_b = max(2, int(size * 0.045))
            start = int(size * 0.32)
            heights = (0.16, 0.26, 0.14, 0.34)
            for index, frac in enumerate(heights):
                left = start + index * (bar_w + gap_b)
                height = int(size * frac)
                if left <= x < left + bar_w and base - height <= y < base:
                    color = gold if index < 3 else pine
            row.extend(color)
        rows.append(row)
    return rows


def main() -> None:
    os.makedirs(PUBLIC, exist_ok=True)
    os.makedirs(ICONSET, exist_ok=True)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        write_png(os.path.join(PUBLIC, name), size, render(size))
    write_png(os.path.join(ICONSET, "icon-1024.png"), 1024, 1024 and render(1024))
    print("icons written")


if __name__ == "__main__":
    main()
