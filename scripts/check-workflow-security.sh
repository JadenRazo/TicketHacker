#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"
workflow_dir="$root/.github/workflows"

if [[ ! -d "$workflow_dir" ]]; then
  echo "Workflow directory not found: $workflow_dir" >&2
  exit 1
fi

errors=0

while IFS= read -r match; do
  file="${match%%:*}"
  remainder="${match#*:}"
  line_number="${remainder%%:*}"
  content="${remainder#*:}"
  ref="$(printf '%s\n' "$content" | sed -E 's/^[[:space:]-]*uses:[[:space:]]*//' | awk '{print $1}' | tr -d "\"'")"

  case "$ref" in
    ./*)
      continue
      ;;
    docker://*)
      if [[ ! "${ref#docker://}" =~ @sha256:[0-9a-f]{64}$ ]]; then
        echo "$file:$line_number: Docker actions must use an immutable sha256 digest: $ref" >&2
        errors=1
      fi
      ;;
    *@*)
      revision="${ref##*@}"
      if [[ ! "$revision" =~ ^[0-9a-f]{40}$ ]]; then
        echo "$file:$line_number: external actions must use a full commit SHA: $ref" >&2
        errors=1
      fi
      ;;
    *)
      echo "$file:$line_number: malformed external action reference: $ref" >&2
      errors=1
      ;;
  esac
done < <(grep -RInE --include='*.yml' --include='*.yaml' '^[[:space:]-]*uses:[[:space:]]*' "$workflow_dir" || true)

while IFS= read -r match; do
  file="${match%%:*}"
  remainder="${match#*:}"
  line_number="${remainder%%:*}"
  content="${remainder#*:}"
  image="$(printf '%s\n' "$content" | sed -E 's/^[[:space:]]*image:[[:space:]]*//' | awk '{print $1}' | tr -d "\"'")"

  if [[ ! "$image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    echo "$file:$line_number: workflow container images must use an immutable sha256 digest: $image" >&2
    errors=1
  fi
done < <(grep -RInE --include='*.yml' --include='*.yaml' '^[[:space:]]*image:[[:space:]]*' "$workflow_dir" || true)

if (( errors != 0 )); then
  exit 1
fi

echo "Workflow dependency policy passed."
