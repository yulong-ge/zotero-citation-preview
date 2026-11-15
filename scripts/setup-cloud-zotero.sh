#!/usr/bin/env bash
set -euo pipefail
if [[ $# != 1 ]]; then
  echo 'Usage: setup-cloud-zotero.sh INSTALL_DIRECTORY (Linux x86_64)' >&2
  exit 2
fi
[[ "$(uname -s)" == Linux && "$(uname -m)" == x86_64 ]] || { echo 'Zotero cloud setup requires Linux x86_64' >&2; exit 2; }
install_dir="$1"
mkdir -p "$install_dir"
archive="$install_dir/Zotero-10.0.8_linux-x86_64.tar.xz"
curl --fail --location --retry 3 --retry-max-time 120 --output "$archive" \
  'https://download.zotero.org/client/release/10.0.8/Zotero-10.0.8_linux-x86_64.tar.xz'
sha256sum "$archive"
tar -xJf "$archive" -C "$install_dir"
test -x "$install_dir/Zotero_linux-x86_64/zotero"
