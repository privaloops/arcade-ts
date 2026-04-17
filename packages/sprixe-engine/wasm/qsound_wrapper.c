/**
 * QSound HLE WASM wrapper
 * Same pattern as opm_wrapper.c — exposes minimal API for the CPS1 emulator.
 *
 * Sample rate: 60 MHz / 2 / 1248 = 24038 Hz (stereo)
 */

#include "qsound.h"
#include <emscripten.h>
#include <string.h>

static qsound_t chip;

/* Sample buffer (stereo, ~2 frames worth at 24kHz / 60fps ≈ 400/frame) */
#define SAMPLE_BUF_SIZE 2048
static float sample_buf_l[SAMPLE_BUF_SIZE];
static float sample_buf_r[SAMPLE_BUF_SIZE];
static int sample_buf_write_pos = 0;

/* ── Lifecycle ──────────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void qs_init(void) {
    qsound_init(&chip);
    qsound_reset(&chip);
    sample_buf_write_pos = 0;
}

EMSCRIPTEN_KEEPALIVE
void qs_reset(void) {
    qsound_reset(&chip);
    sample_buf_write_pos = 0;
}

/* ── ROM loading ────────────────────────────────────────────── */

/**
 * Load the DSP ROM (dl-1425.bin).
 * Called from JS with a pointer to WASM heap memory.
 * count = number of 16-bit words (should be 4096).
 */
EMSCRIPTEN_KEEPALIVE
void qs_load_dsp_rom(const uint16_t *data, int count) {
    qsound_load_dsp_rom(&chip, data, count);
}

/**
 * Set sample ROM pointer. The data must already be in WASM linear memory
 * (allocated via _malloc from JS side).
 */
EMSCRIPTEN_KEEPALIVE
void qs_set_sample_rom(const uint8_t *data, uint32_t size) {
    qsound_set_sample_rom(&chip, data, size);
}

/* ── Register I/O ───────────────────────────────────────────── */

EMSCRIPTEN_KEEPALIVE
void qs_write(int offset, int data) {
    qsound_write(&chip, offset, (uint8_t)(data & 0xff));
}

EMSCRIPTEN_KEEPALIVE
int qs_read(void) {
    return qsound_read(&chip);
}

/* ── Sample generation ──────────────────────────────────────── */

/**
 * Generate N samples. Each call to qsound_update() produces one stereo pair.
 */
/**
 * Advance the QSound state machine by one sample tick.
 * Updates the ready flag and internal state but does NOT buffer audio.
 * Use this for interleaved Z80 execution where the Z80 polls qs_read().
 */
EMSCRIPTEN_KEEPALIVE
void qs_tick(void) {
    qsound_update(&chip);
}

EMSCRIPTEN_KEEPALIVE
void qs_generate(int num_samples) {
    for (int i = 0; i < num_samples; i++) {
        qsound_update(&chip);
        if (sample_buf_write_pos < SAMPLE_BUF_SIZE) {
            sample_buf_l[sample_buf_write_pos] = chip.out[0] / 32768.0f;
            sample_buf_r[sample_buf_write_pos] = chip.out[1] / 32768.0f;
            sample_buf_write_pos++;
        }
    }
}

EMSCRIPTEN_KEEPALIVE
int qs_get_sample_count(void) {
    return sample_buf_write_pos;
}

EMSCRIPTEN_KEEPALIVE
float *qs_get_samples_l(void) {
    return sample_buf_l;
}

EMSCRIPTEN_KEEPALIVE
float *qs_get_samples_r(void) {
    return sample_buf_r;
}

EMSCRIPTEN_KEEPALIVE
void qs_drain_samples(int count) {
    int excess = sample_buf_write_pos - count;
    if (excess > 0) {
        memmove(sample_buf_l, sample_buf_l + count, excess * sizeof(float));
        memmove(sample_buf_r, sample_buf_r + count, excess * sizeof(float));
    }
    sample_buf_write_pos = excess > 0 ? excess : 0;
}

EMSCRIPTEN_KEEPALIVE
int qs_get_sample_rate(void) {
    return 24038; /* 60 MHz / 2 / 1248 */
}
