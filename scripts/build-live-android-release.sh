#!/usr/bin/env bash
set -euo pipefail

: "${AIR_VERSION_CODE:?Set AIR_VERSION_CODE to an integer higher than every prior release.}"
: "${AIR_VERSION_NAME:?Set AIR_VERSION_NAME to the public release version.}"

air_jdk21_home="${AIR_JDK21_HOME:-}"
homebrew_jdk21='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'

if [[ -z "$air_jdk21_home" && -x "$homebrew_jdk21/bin/java" ]]; then
  air_jdk21_home="$homebrew_jdk21"
fi

if [[ -z "$air_jdk21_home" ]] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
  air_jdk21_home=$(/usr/libexec/java_home -v 21 2>/dev/null || true)
fi

if [[ -z "$air_jdk21_home" || ! -x "$air_jdk21_home/bin/java" ]]; then
  echo 'JDK 21 is required. Install openjdk@21 or set AIR_JDK21_HOME.' >&2
  exit 1
fi

export JAVA_HOME="$air_jdk21_home"
export PATH="$JAVA_HOME/bin:$PATH"

air_apk_tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/hetu-live-apks.XXXXXX")
trap 'rm -rf -- "$air_apk_tmp_dir"' EXIT

(
  cd android
  ./gradlew assembleRelease
  cp app/build/outputs/apk/release/app-release.apk \
    "$air_apk_tmp_dir/hetu-live-release.apk"

  # The first direct-share builds used Android's debug certificate. Keep a
  # minified, debug-signed variant so those installs can update in place and
  # retain their local app data.
  ./gradlew assembleRelease -PAIR_FRIEND_BUILD=true --rerun-tasks
  cp app/build/outputs/apk/release/app-release.apk \
    "$air_apk_tmp_dir/hetu-live-friend.apk"

  cp "$air_apk_tmp_dir/hetu-live-release.apk" \
    app/build/outputs/apk/release/hetu-live-release.apk
  cp "$air_apk_tmp_dir/hetu-live-friend.apk" \
    app/build/outputs/apk/release/hetu-live-friend.apk
)
