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
exec bunx eas update --channel "${CHANNEL}" --message "${MESSAGE}"
