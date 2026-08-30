#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
checker="$script_dir/check-workflow-security.sh"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/.github/workflows"

write_workflow() {
  printf '%s\n' "$1" > "$fixture/.github/workflows/test.yml"
}

write_workflow 'jobs:
  test:
    services:
      redis:
        image: redis:7-alpine@sha256:0000000000000000000000000000000000000000000000000000000000000000
    steps:
      - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803'
"$checker" "$fixture" >/dev/null

write_workflow 'jobs:
  test:
    steps:
      - uses: actions/checkout@v6'
if "$checker" "$fixture" >/dev/null 2>&1; then
  echo "Policy accepted a mutable action tag" >&2
  exit 1
fi

write_workflow 'jobs:
  test:
    services:
      redis:
        image: redis:7-alpine'
if "$checker" "$fixture" >/dev/null 2>&1; then
  echo "Policy accepted a mutable container tag" >&2
  exit 1
fi

echo "Workflow dependency policy negative tests passed."
