#!/usr/bin/env bash
set -eo pipefail
npm install
npm run lint
npm run generate-docs
gcloud app deploy --project=terra-lyle
