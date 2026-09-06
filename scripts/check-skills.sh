#!/bin/sh
set -eu

if [ "$#" -gt 2 ]; then
  echo 'Usage: check-skills.sh [skill-or-catalog] [new-report-directory]' >&2
  exit 2
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
target=${1:-"$repo_root/plugins/deepwright/skills"}
# Keep each run's evidence separate; a failed run must not inherit old reports.
if [ "$#" -ge 2 ]; then
  reports=$2
  if [ -e "$reports" ]; then
    echo 'Report directory already exists; choose a new output directory.' >&2
    exit 2
  fi
else
  reports=$(mktemp -d "${TMPDIR:-/tmp}/deepwright-skill-reports.XXXXXX")
fi

exec skillevaluator validate "$target" \
  --type skill --external --policy "$repo_root/.github/skillevaluator-policy.yaml" \
  --checks schema,pii,license,quality,unicode,lint \
  --no-llm --no-dedup --continue-on-failure --min-score 70 \
  --report json,markdown --output-dir "$reports"
