#!/usr/bin/env python3
import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png(size: int) -> bytes:
    rows = []
    for y in range(size):
        row = [0]
        for x in range(size):
            nx = (x + 0.5) / size
            ny = (y + 0.5) / size
            inset = 0.12
            radius = 0.16
            px = min(nx - inset, 1 - inset - nx, ny - inset, 1 - inset - ny)
            in_sq = px >= 0
            # rounded-ish by ignoring far corners
            corner = (nx < inset + radius and ny < inset + radius) or (
                nx > 1 - inset - radius and ny < inset + radius
            ) or (nx < inset + radius and ny > 1 - inset - radius) or (
                nx > 1 - inset - radius and ny > 1 - inset - radius
            )
            if corner:
                cx = inset + radius if nx < 0.5 else 1 - inset - radius
                cy = inset + radius if ny < 0.5 else 1 - inset - radius
                in_sq = (nx - cx) ** 2 + (ny - cy) ** 2 <= radius ** 2

            # play triangle
            in_tri = nx > 0.38 and nx < 0.38 + (ny - 0.30) * 0.9 and nx < 0.38 + (0.70 - ny) * 0.9 and 0.30 < ny < 0.70

            if in_tri:
                row.extend((28, 20, 6, 255))
            elif in_sq:
                row.extend((228, 181, 74, 255))
            else:
                row.extend((16, 18, 24, 0))
        rows.append(bytes(row))
    raw = b"".join(rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


out = Path(__file__).resolve().parents[1] / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    (out / f"icon{size}.png").write_bytes(png(size))
print(f"wrote icons to {out}")
