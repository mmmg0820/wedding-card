"""Compress invitation photos while preserving aspect ratio and embedded assets."""
import base64
import io
import json
import re
import sys
from pathlib import Path
from PIL import Image, ImageOps

source, destination, report_path = map(Path, sys.argv[1:])
html = source.read_text()
photo_start = html.index('eventPhoto: "')
photo_end = html.index('map: {', photo_start)
reports = []

def compress(match):
    context = html[max(0, match.start() - 100):match.start()]
    is_hero = 'background-image:' in context
    if not is_hero and not photo_start <= match.start() < photo_end:
        return match.group(0)
    raw = base64.b64decode(match[2])
    original = Image.open(io.BytesIO(raw))
    image = ImageOps.exif_transpose(original)
    before = image.size
    image.thumbnail((2000, 2000), Image.Resampling.LANCZOS)
    result = io.BytesIO()
    if is_hero:
        image.save(result, format='WEBP', quality=90, method=6)
        mime = 'webp'
    else:
        image.convert('RGB').save(result, format='JPEG', quality=85, optimize=True, progressive=True)
        mime = 'jpeg'
    compressed = result.getvalue()
    if len(compressed) >= len(raw) and image.size == before:
        compressed, mime = raw, match[1]
    check = Image.open(io.BytesIO(compressed))
    check.load()
    assert max(check.size) <= 2000
    assert abs(check.width / check.height - before[0] / before[1]) < .002
    reports.append({'asset': 'hero' if is_hero else f'photo-{len(reports)}', 'originalWidth': before[0], 'originalHeight': before[1], 'width': check.width, 'height': check.height, 'originalBytes': len(raw), 'bytes': len(compressed), 'format': mime})
    return 'data:image/' + mime + ';base64,' + base64.b64encode(compressed).decode()

updated = re.sub(r'data:image/([^;]+);base64,([A-Za-z0-9+/=]+)', compress, html)
assert len(reports) == 7, f'Expected hero, venue photo and 5 gallery photos; got {len(reports)}'
destination.write_text(updated)
report_path.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(reports, ensure_ascii=False))
