#!/usr/bin/env bash
# Renders scripts/og-image.html to public/assets/og-image.png, the picture in
# link previews. Needs Firefox. Run from anywhere: ./scripts/make-og-image.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/public/assets/og-image.png"

# A throwaway profile, so this works while Firefox is open.
profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

firefox --headless --no-remote --profile "$profile" \
  --window-size=1200,630 \
  --screenshot="$out" "file://$root/scripts/og-image.html"

echo "Wrote $out"
