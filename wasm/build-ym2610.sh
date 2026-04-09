#!/bin/bash
# Build YM2610 WASM module using Emscripten + ymfm
# Requires: emsdk installed and sourced
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Source emsdk if not already active
if ! command -v em++ &> /dev/null; then
  source ~/emsdk/emsdk_env.sh
fi

echo "Building YM2610 WASM..."

em++ -O3 -std=c++17 \
  ym2610_wrapper.cpp \
  ymfm/ymfm_opn.cpp \
  ymfm/ymfm_adpcm.cpp \
  ymfm/ymfm_ssg.cpp \
  ymfm/ymfm_misc.cpp \
  -o ym2610.mjs \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='createYM2610' \
  -s EXPORT_ES6=1 \
  -s SINGLE_FILE=1 \
  -s FILESYSTEM=0 \
  -s ENVIRONMENT='web' \
  -s INITIAL_MEMORY=4194304 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='["_ym2610_init","_ym2610_reset","_ym2610_write","_ym2610_read","_ym2610_clock_cycles","_ym2610_generate","_ym2610_get_sample_count","_ym2610_get_samples_l","_ym2610_get_samples_r","_ym2610_drain_samples","_ym2610_get_sample_rate","_ym2610_alloc_rom","_ym2610_get_irq","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8","HEAPF32"]'

echo "Done: ym2610.mjs ($(du -h ym2610.mjs | cut -f1))"
