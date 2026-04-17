/*
 * QSound HLE — standalone C port
 * Based on MAME's qsoundhle.cpp by superctr & Valley Bell (BSD-3-Clause)
 * Ported for CPS1-Web WASM usage.
 *
 * Original: https://github.com/mamedev/mame/blob/master/src/devices/sound/qsoundhle.cpp
 */
#ifndef QSOUND_H
#define QSOUND_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* DSP ROM data offsets */
#define QS_DATA_PAN_TAB       0x110
#define QS_DATA_ADPCM_TAB     0x9dc
#define QS_DATA_FILTER_TAB    0xd53
#define QS_DATA_FILTER_TAB2   0xf2e

/* DSP state machine addresses */
#define QS_STATE_BOOT         0x000
#define QS_STATE_INIT1        0x288
#define QS_STATE_INIT2        0x61a
#define QS_STATE_REFRESH1     0x039
#define QS_STATE_REFRESH2     0x04f
#define QS_STATE_NORMAL1      0x314
#define QS_STATE_NORMAL2      0x6b2

/* Pan table offsets */
#define QS_PAN_TABLE_DRY      0
#define QS_PAN_TABLE_WET      98
#define QS_PAN_TABLE_CH_OFF   196

/* Filter / delay constants */
#define QS_FILTER_ENTRY_SIZE  95
#define QS_DELAY_BASE_OFFSET  0x554
#define QS_DELAY_BASE_OFFSET2 0x53c

/* ── Structures ─────────────────────────────────────────────── */

typedef struct {
    uint16_t bank;
    int16_t  addr;
    uint16_t phase;
    uint16_t rate;
    int16_t  loop_len;
    int16_t  end_addr;
    int16_t  volume;
    int16_t  echo;
} qs_voice_t;

typedef struct {
    uint16_t start_addr;
    uint16_t end_addr;
    uint16_t bank;
    int16_t  volume;
    uint16_t flag;
    int16_t  cur_vol;
    int16_t  step_size;
    uint16_t cur_addr;
} qs_adpcm_t;

typedef struct {
    int      tap_count;
    int      delay_pos;
    uint16_t table_pos;
    int16_t  taps[95];
    int16_t  delay_line[95];
} qs_fir_t;

typedef struct {
    int16_t delay;
    int16_t volume;
    int16_t write_pos;
    int16_t read_pos;
    int16_t delay_line[51];
} qs_delay_t;

typedef struct {
    uint16_t end_pos;
    int16_t  feedback;
    int16_t  length;
    int16_t  last_sample;
    int16_t  delay_line[1024];
    int16_t  delay_pos;
} qs_echo_t;

/* ── Main QSound state ──────────────────────────────────────── */

typedef struct {
    /* DSP ROM (4K x 16-bit, loaded externally) */
    uint16_t dsp_rom[4096];

    /* Sample ROM (up to 16MB, loaded externally) */
    const uint8_t *sample_rom;
    uint32_t sample_rom_size;

    /* Data latch (Z80 writes 3 bytes: data_hi, data_lo, address) */
    uint16_t data_latch;

    /* Stereo output (updated each sample) */
    int16_t out[2];

    /* 16 PCM voices */
    qs_voice_t voice[16];

    /* 3 ADPCM voices */
    qs_adpcm_t adpcm[3];

    /* Pan + per-voice output */
    uint16_t voice_pan[19];     /* 16 PCM + 3 ADPCM */
    int16_t  voice_output[19];

    /* Echo */
    qs_echo_t echo;

    /* FIR filters (wet/dry × L/R) */
    qs_fir_t   filter[2];
    qs_fir_t   alt_filter[2];

    /* Delay lines (wet/dry × L/R) */
    qs_delay_t wet[2];
    qs_delay_t dry[2];

    /* State machine */
    uint16_t state;
    uint16_t next_state;
    uint16_t delay_update;
    int      state_counter;
    int      ready_flag;

    /* Register map: 256 pointers into the fields above */
    uint16_t *register_map[256];
} qsound_t;

/* ── API ────────────────────────────────────────────────────── */

/**
 * Initialize QSound state and register map.
 * Must be called before any other function.
 */
void qsound_init(qsound_t *qs);

/**
 * Reset the DSP to boot state.
 */
void qsound_reset(qsound_t *qs);

/**
 * Load the DSP ROM (dl-1425.bin, 4096 x 16-bit words).
 * The data is COPIED into the qsound_t struct.
 */
void qsound_load_dsp_rom(qsound_t *qs, const uint16_t *data, int count);

/**
 * Set the sample ROM pointer (zero-copy, caller must keep alive).
 */
void qsound_set_sample_rom(qsound_t *qs, const uint8_t *data, uint32_t size);

/**
 * Write to QSound registers (called by Z80).
 *   offset 0: data high byte
 *   offset 1: data low byte
 *   offset 2: register address (triggers write)
 */
void qsound_write(qsound_t *qs, int offset, uint8_t data);

/**
 * Read QSound ready flag (0x00 = busy, 0x80 = ready).
 */
uint8_t qsound_read(qsound_t *qs);

/**
 * Generate one output sample (updates qs->out[0], qs->out[1]).
 * Call this at the QSound sample rate (24038 Hz).
 */
void qsound_update(qsound_t *qs);

#ifdef __cplusplus
}
#endif

#endif /* QSOUND_H */
