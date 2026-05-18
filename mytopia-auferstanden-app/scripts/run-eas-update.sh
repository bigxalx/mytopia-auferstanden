#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/run-eas-update.sh <channel> [message]" >&2
  exit 1
fi

CHANNEL="$1"
shift || true
PREFLIGHT_ONLY=0
if [[ "${1:-}" == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=1
  shift || true
fi
MESSAGE="${EAS_UPDATE_MESSAGE:-$*}"

if [[ "${PREFLIGHT_ONLY}" -eq 0 && -z "${MESSAGE}" ]]; then
  echo "Provide an update message, for example:" >&2
  echo "  bun run update:js:${CHANNEL} -- \"Fix feed copy spacing\"" >&2
  exit 1
fi

cd "${APP_DIR}"

load_app_env "${APP_DIR}"

if [[ "${CHANNEL}" == "production" && -z "${EXPO_PUBLIC_APP_ENV:-}" ]]; then
  export EXPO_PUBLIC_APP_ENV="production"
fi

bun ./scripts/verify-release-config.mjs "${CHANNEL}" --ota

if [[ "${PREFLIGHT_ONLY}" -eq 1 ]]; then
  echo "Preflight completed; no update was published."
  exit 0
fi

bun ./scripts/increment-ota-version.mjs

echo "Publishing iOS update..."
CI=1 bunx eas-cli update \
  --channel "${CHANNEL}" \
  --message "${MESSAGE}" \
  --platform ios \
  --environment "${CHANNEL}" \
  --non-interactive

echo "Publishing Android update..."
CI=1 bunx eas-cli update \
  --channel "${CHANNEL}" \
  --message "${MESSAGE}" \
  --platform android \
  --environment "${CHANNEL}" \
  --non-interactive
