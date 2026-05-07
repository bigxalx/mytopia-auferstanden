#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_app_env "${APP_DIR}"

for candidate in /opt/homebrew/opt/ruby/bin/bundle /usr/local/opt/ruby/bin/bundle; do
  if [[ -x "${candidate}" ]]; then
    export PATH="$(dirname "${candidate}"):${PATH}"
    BUNDLE_BIN="${candidate}"
    break
  fi
done

if [[ -z "${BUNDLE_BIN:-}" ]]; then
  BUNDLE_BIN="$(command -v bundle || true)"
fi

if [[ -z "${BUNDLE_BIN}" ]]; then
  echo "Bundler is not installed. Install Homebrew Ruby first: brew install ruby" >&2
  exit 1
fi

BUNDLER_VERSION="$("${BUNDLE_BIN}" -v 2>/dev/null || true)"
if [[ "${BUNDLER_VERSION}" == "Bundler version 1."* ]]; then
  echo "Bundler 1.x is too old for this Fastlane setup. Add /opt/homebrew/opt/ruby/bin to PATH or install Homebrew Ruby." >&2
  exit 1
fi

export BUNDLE_PATH="${BUNDLE_PATH:-vendor/bundle}"
export BUNDLE_DISABLE_SHARED_GEMS="${BUNDLE_DISABLE_SHARED_GEMS:-1}"

cd "${APP_DIR}"
exec "${BUNDLE_BIN}" "$@"
