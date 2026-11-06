#!/bin/sh
# Build a complete local uTools directory without rewriting the checkout.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
stage=$(mktemp -d "${TMPDIR:-/tmp}/eypc-utools-build.XXXXXXXX")
printf 'CHECKOUT %s\nSTAGE %s\n' "$root" "$stage"
rsync -a --exclude=node_modules "$root/src" "$root/preload" "$root/public" "$root/scripts" "$root/tests" "$root/contracts" "$root/vibe" "$stage/"
cp "$root/package.json" "$root/pnpm-lock.yaml" "$root/tsconfig.json" "$root/vite.config.ts" "$root/index.html" "$root/float.html" "$root/action.html" "$stage/"
ln -s "$root/node_modules" "$stage/node_modules"
cd "$stage"
pnpm run build
node scripts/validate-requirements.mjs --write-current-truth
pnpm dlx @electron/asar@4.3.1 pack "$stage/dist" "$stage/eypc.asar" --unpack '*.node'
printf 'ARTIFACT %s/dist/plugin.json\n' "$stage"
printf 'ASAR %s/eypc.asar\n' "$stage"
