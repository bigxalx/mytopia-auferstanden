#!/usr/bin/env bash

load_env_file() {
  local env_file="$1"

  if [[ ! -f "${env_file}" ]]; then
    return
  fi

  echo "Loading variables from ${env_file}..."
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
}

load_app_env() {
  local app_dir="$1"

  load_env_file "${app_dir}/.env"
  load_env_file "${app_dir}/.env.local"
}
