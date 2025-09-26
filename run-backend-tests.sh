#!/usr/bin/env bash
# Run backend Jest directly from the backend package to avoid monorepo interference
set -euo pipefail
BASEDIR=$(cd "$(dirname "$0")" && pwd)
export NODE_ENV=test
cd "$BASEDIR"
# Use local jest binary
./node_modules/.bin/jest --runTestsByPath "$BASEDIR/__tests__/domainAuthService.test.js" --testEnvironment=node --runInBand --detectOpenHandles
