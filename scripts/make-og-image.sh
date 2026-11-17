#!/usr/bin/env bash
# Renders scripts/og-image.html to public/assets/og-image.png, the picture in
# link previews. Needs Firefox and a build (npm run build), since the
# mountains are copied out of the built home page. Run from anywhere:
# ./scripts/make-og-image.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/assets/og-image.png"
built="$root/dist/index.html"

if [ ! -f "$built" ]; then
  echo "No $built: run npm run build first." >&2
  exit 1
fi

# The page with the mountains filled in. It sits next to og-image.html so
# the image paths in it still resolve.
page="$root/scripts/.og-image.tmp.html"
# A throwaway profile, so this works while Firefox is open.
profile="$(mktemp -d)"
trap 'rm -rf "$profile" "$page"' EXIT

node -e '
  const fs = require("fs");
  const [template, built, page] = process.argv.slice(1);
  const svg = fs.readFileSync(built, "utf8")
    .match(/<svg class="landscape landscape-mountains"[\s\S]*?<\/svg>/);
  if (!svg) throw new Error("No mountain landscape in " + built);
  fs.writeFileSync(page,
    fs.readFileSync(template, "utf8").replace("<!-- LANDSCAPE -->", svg[0]));
' "$root/scripts/og-image.html" "$built" "$page"

firefox --headless --no-remote --profile "$profile" \
  --window-size=1200,630 \
  --screenshot="$out" "file://$page"

echo "Wrote $out"
