#!/usr/bin/env python3
"""Generate the extension's PNG icons in three sizes using only the stdlib.

Design: a dark rounded square with a yellow "no entry" disc — a circle with
a horizontal bar — to read as "stop / get back to work" at any size.
"""

import os
import struct
import zlib

BG = (26, 29, 36, 255)          # #1a1d24
DISC = (240, 198, 116, 255)     # #f0c674
BAR = (26, 29, 36, 255)         # same as bg, so it punches through


def blend(top, bottom, alpha):
    """Alpha-composite top over bottom; alpha is 0..1."""
    return tuple(
        int(round(top[i] * alpha + bottom[i] * (1 - alpha))) for i in range(3)
    ) + (255,)


def coverage(cx, cy, r, x, y, samples=4):
    """Supersample a pixel's coverage of the disc of radius r centered at (cx,cy)."""
    hit = 0
    step = 1 / samples
    offset = step / 2
    for sy in range(samples):
        for sx in range(samples):
            px = x + offset + sx * step
            py = y + offset + sy * step
            dx = px - cx
            dy = py - cy
            if dx * dx + dy * dy <= r * r:
                hit += 1
    return hit / (samples * samples)


def rounded_rect_coverage(x, y, w, h, radius, px, py, samples=4):
    hit = 0
    step = 1 / samples
    offset = step / 2
    for sy in range(samples):
        for sx in range(samples):
            tx = px + offset + sx * step
            ty = py + offset + sy * step
            if tx < x or tx > x + w or ty < y or ty > y + h:
                continue
            # check rounded corners
            cx = min(max(tx, x + radius), x + w - radius)
            cy = min(max(ty, y + radius), y + h - radius)
            dx = tx - cx
            dy = ty - cy
            if dx * dx + dy * dy <= radius * radius:
                hit += 1
    return hit / (samples * samples)


def render(size):
    pad = max(1, size // 16)
    rect_w = size - 2 * pad
    rect_h = size - 2 * pad
    rect_r = size // 6

    disc_cx = size / 2
    disc_cy = size / 2
    disc_r = size * 0.34

    bar_h = max(2, size // 8)
    bar_w = disc_r * 1.4
    bar_x = disc_cx - bar_w / 2
    bar_y = disc_cy - bar_h / 2

    pixels = []
    for y in range(size):
        for x in range(size):
            # background card
            cov_card = rounded_rect_coverage(pad, pad, rect_w, rect_h, rect_r, x, y)
            color = blend(BG, (0, 0, 0, 0), cov_card)

            # disc
            cov_disc = coverage(disc_cx, disc_cy, disc_r, x, y)
            if cov_disc > 0:
                color = blend(DISC, color, cov_disc)

            # bar punches through disc with bg color
            in_bar_x = bar_x <= x + 0.5 <= bar_x + bar_w
            in_bar_y = bar_y <= y + 0.5 <= bar_y + bar_h
            if in_bar_x and in_bar_y:
                color = BG

            pixels.append(color)

    return pixels


def write_png(path, size, pixels):
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        for x in range(size):
            r, g, b, a = pixels[y * size + x]
            raw.extend([r, g, b, a])

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # RGBA 8-bit
    idat = zlib.compress(bytes(raw), 9)
    iend = b""
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", iend))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for size in (16, 48, 128):
        pixels = render(size)
        out = os.path.join(here, f"icon{size}.png")
        write_png(out, size, pixels)
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
