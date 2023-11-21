#!/bin/sh

set -e

# Function to check if --force flag is provided
check_force_flag() {
    for arg in "$@"; do
        if [ "$arg" = "--force" ]; then
            return 0 # Flag found
        fi
    done
    return 1 # Flag not found
}

ROOT_DIR=$(pwd)
OUT_FILE="$ROOT_DIR/../assets/bebopc.wasm"

# Run the script only if OUT_FILE doesn't exist or --force flag is provided
if [ ! -f "$OUT_FILE" ] || check_force_flag "$@"; then
    cd ../bebop/scripts/
    ./build-wasi.sh
    mv ../bin/compiler/Release/artifacts/wasi-wasm/AppBundle/bebopc.wasm "$OUT_FILE"
    cd "$ROOT_DIR"
else
    echo "bebopc already exists. Use --force to overwrite."
fi