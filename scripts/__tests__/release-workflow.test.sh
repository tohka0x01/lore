#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORKFLOW="$ROOT/.github/workflows/release.yml"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

grep -Fq 'name: Build OpenCode artifact' "$WORKFLOW" || fail 'OpenCode artifact step missing'
grep -Fq 'cd opencode-plugin' "$WORKFLOW" || fail 'OpenCode package directory missing'
grep -Fq 'npm ci' "$WORKFLOW" || fail 'OpenCode npm ci missing'
grep -Fq 'npm test' "$WORKFLOW" || fail 'OpenCode tests missing'
grep -Fq 'npm run typecheck' "$WORKFLOW" || fail 'OpenCode typecheck missing'
grep -Fq 'bash scripts/build-opencode-artifact.sh' "$WORKFLOW" || fail 'OpenCode artifact builder missing'
grep -Fq 'for f in dist/lore-*.zip' "$WORKFLOW" || fail 'release upload loop missing'

BUILD_LINE=$(grep -n 'name: Build OpenCode artifact' "$WORKFLOW" | cut -d: -f1)
UPLOAD_LINE=$(grep -n 'name: Upload artifacts to release' "$WORKFLOW" | cut -d: -f1)
[[ "$BUILD_LINE" -lt "$UPLOAD_LINE" ]] || fail 'OpenCode artifact must build before upload'

echo "release workflow tests passed"
