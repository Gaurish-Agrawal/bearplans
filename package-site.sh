#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
dist_dir="$project_dir/dist"
archive="$dist_dir/bearplans-site-deploy-v1.2.1.zip"

"$project_dir/workday-extension/package.sh"
version=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version' "$project_dir/workday-extension/manifest.json")
mkdir -p "$project_dir/static/downloads"
cp "$dist_dir/bearplans-workday-importer-v$version.zip" "$project_dir/static/downloads/bearplans-workday-importer.zip"

mkdir -p "$dist_dir"
rm -f "$archive"

cd "$project_dir"
zip -qr "$archive" \
  app.py \
  main.py \
  requirements.txt \
  templates \
  static \
  DEPLOYMENT.md \
  RELEASE_CHECKLIST.md \
  -x '*/.DS_Store' '*/__pycache__/*'

unzip -tq "$archive"
echo "$archive"
