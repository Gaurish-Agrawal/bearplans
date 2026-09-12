#!/bin/sh
set -eu

extension_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_dir=$(dirname -- "$extension_dir")
dist_dir="$project_dir/dist"
version=$(sed -nE 's/^[[:space:]]*"version": "([^"]+)",?$/\1/p' "$extension_dir/manifest.json")
archive="$dist_dir/bearplans-workday-importer-v$version.zip"

if [ -z "$version" ]; then
  echo "Could not read the extension version." >&2
  exit 1
fi

mkdir -p "$dist_dir"
rm -f "$archive"

cd "$extension_dir"
zip -q "$archive" \
  manifest.json \
  background.js \
  service-worker.js \
  export-common.js \
  export-worker.js \
  workday-saver.js \
  site-bridge.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  icons/icon-16.png \
  icons/icon-32.png \
  icons/icon-48.png \
  icons/icon-128.png

unzip -tq "$archive"
echo "$archive"
