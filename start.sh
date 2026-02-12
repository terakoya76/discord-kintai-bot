#!/usr/bin/env bash

set -eux -o pipefail

project_root=$(dirname "$0")
cd "$project_root"

pnpm dlx tsx main.ts
