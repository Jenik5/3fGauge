#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
target_dir=/config/www/community/3fGauge
target_file="$target_dir/3f-gauge.js"
source_file="$script_dir/3f-gauge.js"

mkdir -p "$target_dir"

if [ -e "$target_file" ] || [ -L "$target_file" ]; then
  rm "$target_file"
fi

ln -s "$source_file" "$target_file"

printf '3f Gauge linked: %s -> %s\n' "$target_file" "$source_file"
