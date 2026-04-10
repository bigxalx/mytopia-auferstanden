#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/run-eas-update.sh <channel> [message]" >&2
  exit 1
fi

CHANNEL="$1"
shift || true
MESSAGE="${EAS_UPDATE_MESSAGE:-$*}"

if [[ -z "${MESSAGE}" ]]; then
  echo "Provide an update message, for example:" >&2
  echo "  bun run update:js:${CHANNEL} -- \"Fix feed copy spacing\"" >&2
  exit 1
fi

cd "${APP_DIR}"

if [ -f .env ]; then
  echo "Loading variables from .env..."
  export $(grep -v '^#' .env | xargs)
fi

if [ -f .env.local ]; then
  echo "Loading variables from .env.local..."
  export $(grep -v '^#' .env.local | xargs)
fi

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
