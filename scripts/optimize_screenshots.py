#!/usr/bin/env python3

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "docs" / "screenshots"
DOCS_OUTPUT_DIR = ROOT / "docs" / "screenshots-web"
SITE_OUTPUT_DIR = ROOT / "site" / "screenshots"
MAX_WIDTH = 1600
WEBP_QUALITY = 80
SKIP_NAMES = {"mascot.gif"}


def require_magick() -> None:
    if shutil.which("magick") is None:
        raise SystemExit("ImageMagick is required. Install `magick` and rerun.")


def optimize_image(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "magick",
        str(source),
        "-resize",
        f"{MAX_WIDTH}x>",
        "-quality",
        str(WEBP_QUALITY),
        "-strip",
        str(destination),
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    require_magick()

    optimized = 0
    for source in sorted(SOURCE_DIR.iterdir()):
        if not source.is_file() or source.name in SKIP_NAMES:
            continue
        target_name = f"{source.stem}.webp"
        docs_target = DOCS_OUTPUT_DIR / target_name
        site_target = SITE_OUTPUT_DIR / target_name
        optimize_image(source, docs_target)
        shutil.copy2(docs_target, site_target)
        optimized += 1

    print(f"Optimized {optimized} screenshots.")


if __name__ == "__main__":
    main()
