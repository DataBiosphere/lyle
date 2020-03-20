#!/usr/bin/env bash
set -eo pipefail
yarn install
yarn lint
yarn generate-docs
gcloud app deploy --project=terra-lyle
