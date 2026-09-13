#!/usr/bin/env bash
set -euo pipefail

# Gradle 8.14 does not run on JDK 25. Use the same supported runtime for
# debug, release, bundle, and instrumented test builds.
air_jdk21_home="${AIR_JDK21_HOME:-}"
homebrew_jdk21='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'

if [[ -z "$air_jdk21_home" && -x "$homebrew_jdk21/bin/java" ]]; then
  air_jdk21_home="$homebrew_jdk21"
fi

if [[ -z "$air_jdk21_home" && -x /usr/libexec/java_home ]]; then
  air_jdk21_home=$(/usr/libexec/java_home -v 21 2>/dev/null || true)
fi

if [[ -z "$air_jdk21_home" && -n "${JAVA_HOME:-}" ]]; then
  air_jdk21_home="$JAVA_HOME"
fi

if [[ ! -x "$air_jdk21_home/bin/java" ]] ||
   ! "$air_jdk21_home/bin/java" -version 2>&1 | grep -Eq 'version "21[.\"]'; then
  echo 'JDK 21 is required. Install openjdk@21 or set AIR_JDK21_HOME to a JDK 21 directory.' >&2
  exit 1
fi

export JAVA_HOME="$air_jdk21_home"
export PATH="$JAVA_HOME/bin:$PATH"
air_repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$air_repo_root/android"
exec ./gradlew "$@"
