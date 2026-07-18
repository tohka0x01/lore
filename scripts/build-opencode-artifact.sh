#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PLUGIN_DIR="$ROOT/opencode-plugin"
DIST_DIR="$ROOT/dist"
STAGE_DIR="$DIST_DIR/opencode"
ARCHIVE="$DIST_DIR/lore-opencode.zip"

cd "$PLUGIN_DIR"
npm run build

rm -rf "$STAGE_DIR" "$ARCHIVE"
mkdir -p "$STAGE_DIR"
cp "$PLUGIN_DIR/dist/lore-memory.js" "$STAGE_DIR/lore-memory.js"
cp "$PLUGIN_DIR/README.md" "$STAGE_DIR/README.md"
cp "$PLUGIN_DIR/THIRD_PARTY_NOTICES.md" "$STAGE_DIR/THIRD_PARTY_NOTICES.md"

(
  cd "$STAGE_DIR"
  zip -X -q "$ARCHIVE" lore-memory.js README.md THIRD_PARTY_NOTICES.md
)

printf 'Built %s\n' "$ARCHIVE"
