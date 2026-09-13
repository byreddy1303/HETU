#!/usr/bin/env bash
set -euo pipefail

: "${AIR_VERSION_CODE:?Set AIR_VERSION_CODE to an integer higher than every prior release.}"
: "${AIR_VERSION_NAME:?Set AIR_VERSION_NAME to the public release version.}"
air_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$air_repo_root"

air_apk_tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/hetu-apks.XXXXXX")
trap 'rm -rf -- "$air_apk_tmp_dir"' EXIT

(
  cd android
  bash ../scripts/android-gradle.sh assembleRelease
  cp app/build/outputs/apk/release/app-release.apk \
    "$air_apk_tmp_dir/hetu-release.apk"

  # Direct-share devices use Android's debug certificate. Keep a minified,
  # debug-signed variant so those installs update in place without data loss.
  bash ../scripts/android-gradle.sh assembleRelease -PAIR_FRIEND_BUILD=true --rerun-tasks
  cp app/build/outputs/apk/release/app-release.apk \
    "$air_apk_tmp_dir/hetu-friend.apk"

  rm -f app/build/outputs/apk/release/hetu-live-release.apk \
    app/build/outputs/apk/release/hetu-live-friend.apk
  cp "$air_apk_tmp_dir/hetu-release.apk" \
    app/build/outputs/apk/release/hetu-release.apk
  cp "$air_apk_tmp_dir/hetu-friend.apk" \
    app/build/outputs/apk/release/hetu-friend.apk
)
