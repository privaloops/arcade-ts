/*
 * QSound HLE — standalone C port
 * Based on MAME's qsoundhle.cpp by superctr & Valley Bell (BSD-3-Clause)
 *
 * Original: https://github.com/mamedev/mame/blob/master/src/devices/sound/qsoundhle.cpp
 * License of original: BSD-3-Clause
 */

#include "qsound.h"
#include <string.h>
#include <stdlib.h>

/* ── Helpers ────────────────────────────────────────────────── */

static inline int32_t clamp32(int32_t v, int32_t lo, int32_t hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline int16_t clamp16(int32_t v) {
    if (v < -32768) return -32768;
    if (v > 32767)  return 32767;
    return (int16_t)v;
}

static inline uint16_t read_dsp_rom(qsound_t *qs, uint16_t addr) {
    return qs->dsp_rom[addr & 0xfff];
}

static inline int16_t read_sample(qsound_t *qs, uint16_t bank, uint16_t address) {
    bank &= 0x7fff;
    uint32_t rom_addr = ((uint32_t)bank << 16) | address;
    if (!qs->sample_rom || rom_addr >= qs->sample_rom_size)
        return 0;
    return (int16_t)(qs->sample_rom[rom_addr] << 8);
}

/* ── Voice update ───────────────────────────────────────────── */

static int16_t voice_update(qsound_t *qs, qs_voice_t *v, int32_t *echo_out) {
    int16_t output = (v->volume * read_sample(qs, v->bank, v->addr)) >> 14;

    *echo_out += (output * v->echo) << 2;

    int32_t new_phase = v->rate + ((v->addr << 12) | (v->phase >> 4));

    if ((new_phase >> 12) >= v->end_addr)
        new_phase -= (v->loop_len << 12);

    new_phase = clamp32(new_phase, -0x8000000, 0x7FFFFFF);
    v->addr  = (int16_t)(new_phase >> 12);
    v->phase = (uint16_t)((new_phase << 4) & 0xffff);

    return output;
}

/* ── ADPCM update ───────────────────────────────────────────── */

static int16_t adpcm_update(qsound_t *qs, qs_adpcm_t *a, int16_t curr_sample, int nibble) {
    int8_t step;

    if (!nibble) {
        if (a->cur_addr == a->end_addr)
            a->cur_vol = 0;

        if (a->flag) {
            curr_sample = 0;
            a->flag = 0;
            a->step_size = 10;
            a->cur_vol = a->volume;
            a->cur_addr = a->start_addr;
        }

        step = (int8_t)(read_sample(qs, a->bank, a->cur_addr) >> 8);
    } else {
        step = (int8_t)(read_sample(qs, a->bank, a->cur_addr++) >> 4);
    }

    step >>= 4;

    int32_t delta = ((1 + abs(step << 1)) * a->step_size) >> 1;
    if (step <= 0)
        delta = -delta;
    delta += curr_sample;
    delta = clamp32(delta, -32768, 32767);

    a->step_size = (int16_t)((read_dsp_rom(qs, QS_DATA_ADPCM_TAB + 8 + step) * a->step_size) >> 6);
    if (a->step_size < 1)    a->step_size = 1;
    if (a->step_size > 2000) a->step_size = 2000;

    return (int16_t)((delta * a->cur_vol) >> 16);
}

/* ── Echo ───────────────────────────────────────────────────── */

static int16_t echo_apply(qs_echo_t *e, int32_t input) {
    int32_t old_sample = e->delay_line[e->delay_pos];
    int32_t last_sample = e->last_sample;
    e->last_sample = (int16_t)old_sample;
    old_sample = (old_sample + last_sample) >> 1;

    int32_t new_sample = input + ((old_sample * e->feedback) << 2);
    e->delay_line[e->delay_pos++] = (int16_t)(new_sample >> 16);

    if (e->delay_pos >= e->length)
        e->delay_pos = 0;

    return (int16_t)old_sample;
}

/* ── FIR filter ─────────────────────────────────────────────── */

static int32_t fir_apply(qs_fir_t *f, int16_t input) {
    int32_t output = 0;
    int tap;

    for (tap = 0; tap < f->tap_count - 1; tap++) {
        output -= (f->taps[tap] * f->delay_line[f->delay_pos++]) << 2;
        if (f->delay_pos >= f->tap_count - 1)
            f->delay_pos = 0;
    }

    output -= (f->taps[tap] * input) << 2;

    f->delay_line[f->delay_pos++] = input;
    if (f->delay_pos >= f->tap_count - 1)
        f->delay_pos = 0;

    return output;
}

/* ── Delay line ─────────────────────────────────────────────── */

static int32_t delay_apply(qs_delay_t *d, int32_t input) {
    d->delay_line[d->write_pos++] = (int16_t)(input >> 16);
    if (d->write_pos >= 51)
        d->write_pos = 0;

    int32_t output = d->delay_line[d->read_pos++] * d->volume;
    if (d->read_pos >= 51)
        d->read_pos = 0;

    return output;
}

static void delay_update(qs_delay_t *d) {
    int16_t new_read_pos = (d->write_pos - d->delay) % 51;
    if (new_read_pos < 0)
        d->read_pos = new_read_pos + 51;
    else
        d->read_pos = new_read_pos;
}

/* ── State machine: init ────────────────────────────────────── */

static void state_init(qsound_t *qs) {
    int mode = (qs->state == QS_STATE_INIT2) ? 1 : 0;
    int i;

    if (qs->state_counter >= 2) {
        qs->state_counter = 0;
        qs->state = qs->next_state;
        return;
    } else if (qs->state_counter == 1) {
        qs->state_counter++;
        return;
    }

    memset(qs->voice, 0, sizeof(qs->voice));
    memset(qs->adpcm, 0, sizeof(qs->adpcm));
    memset(qs->filter, 0, sizeof(qs->filter));
    memset(qs->alt_filter, 0, sizeof(qs->alt_filter));
    memset(qs->wet, 0, sizeof(qs->wet));
    memset(qs->dry, 0, sizeof(qs->dry));
    memset(&qs->echo, 0, sizeof(qs->echo));

    for (i = 0; i < 19; i++) {
        qs->voice_pan[i] = QS_DATA_PAN_TAB + 0x10;
        qs->voice_output[i] = 0;
    }

    for (i = 0; i < 16; i++)
        qs->voice[i].bank = 0x8000;
    for (i = 0; i < 3; i++)
        qs->adpcm[i].bank = 0x8000;

    if (mode == 0) {
        qs->wet[0].delay = 0;
        qs->dry[0].delay = 46;
        qs->wet[1].delay = 0;
        qs->dry[1].delay = 48;
        qs->filter[0].table_pos = QS_DATA_FILTER_TAB + (QS_FILTER_ENTRY_SIZE * 1);
        qs->filter[1].table_pos = QS_DATA_FILTER_TAB + (QS_FILTER_ENTRY_SIZE * 2);
        qs->echo.end_pos = QS_DELAY_BASE_OFFSET + 6;
        qs->next_state = QS_STATE_REFRESH1;
    } else {
        qs->wet[0].delay = 1;
        qs->dry[0].delay = 0;
        qs->wet[1].delay = 0;
        qs->dry[1].delay = 0;
        qs->filter[0].table_pos = 0xf73;
        qs->filter[1].table_pos = 0xfa4;
        qs->alt_filter[0].table_pos = 0xf73;
        qs->alt_filter[1].table_pos = 0xfa4;
        qs->echo.end_pos = QS_DELAY_BASE_OFFSET2 + 6;
        qs->next_state = QS_STATE_REFRESH2;
    }

    qs->wet[0].volume = 0x3fff;
    qs->dry[0].volume = 0x3fff;
    qs->wet[1].volume = 0x3fff;
    qs->dry[1].volume = 0x3fff;

    qs->delay_update = 1;
    qs->ready_flag = 0;
    qs->state_counter = 1;
}

/* ── State machine: refresh filters ─────────────────────────── */

static void state_refresh_filter_1(qsound_t *qs) {
    int ch, i;
    for (ch = 0; ch < 2; ch++) {
        qs->filter[ch].delay_pos = 0;
        qs->filter[ch].tap_count = 95;
        for (i = 0; i < 95; i++)
            qs->filter[ch].taps[i] = (int16_t)read_dsp_rom(qs, qs->filter[ch].table_pos + i);
    }
    qs->state = qs->next_state = QS_STATE_NORMAL1;
}

static void state_refresh_filter_2(qsound_t *qs) {
    int ch, i;
    for (ch = 0; ch < 2; ch++) {
        qs->filter[ch].delay_pos = 0;
        qs->filter[ch].tap_count = 45;
        for (i = 0; i < 45; i++)
            qs->filter[ch].taps[i] = (int16_t)read_dsp_rom(qs, qs->filter[ch].table_pos + i);

        qs->alt_filter[ch].delay_pos = 0;
        qs->alt_filter[ch].tap_count = 44;
        for (i = 0; i < 44; i++)
            qs->alt_filter[ch].taps[i] = (int16_t)read_dsp_rom(qs, qs->alt_filter[ch].table_pos + i);
    }
    qs->state = qs->next_state = QS_STATE_NORMAL2;
}

/* ── State machine: normal update ───────────────────────────── */

static void state_normal_update(qsound_t *qs) {
    int i, ch;

    qs->ready_flag = 0x80;

    /* Recalculate echo length */
    if (qs->state == QS_STATE_NORMAL2)
        qs->echo.length = qs->echo.end_pos - QS_DELAY_BASE_OFFSET2;
    else
        qs->echo.length = qs->echo.end_pos - QS_DELAY_BASE_OFFSET;

    if (qs->echo.length < 0) qs->echo.length = 0;
    if (qs->echo.length > 1024) qs->echo.length = 1024;

    /* Update 16 PCM voices */
    int32_t echo_input = 0;
    for (i = 0; i < 16; i++)
        qs->voice_output[i] = voice_update(qs, &qs->voice[i], &echo_input);

    /* Update ADPCM (one voice every 3 samples) */
    int adpcm_voice = qs->state_counter % 3;
    qs->voice_output[16 + adpcm_voice] = adpcm_update(
        qs, &qs->adpcm[adpcm_voice],
        qs->voice_output[16 + adpcm_voice],
        qs->state_counter / 3);

    int16_t echo_output = echo_apply(&qs->echo, echo_input);

    /* Mix and filter per channel */
    for (ch = 0; ch < 2; ch++) {
        int32_t wet = (ch == 1) ? echo_output << 14 : 0;
        int32_t dry_val = (ch == 0) ? echo_output << 14 : 0;

        for (i = 0; i < 19; i++) {
            uint16_t pan_index = qs->voice_pan[i] + (ch * QS_PAN_TABLE_CH_OFF);
            dry_val -= (qs->voice_output[i] * (int16_t)read_dsp_rom(qs, pan_index + QS_PAN_TABLE_DRY));
            wet     -= (qs->voice_output[i] * (int16_t)read_dsp_rom(qs, pan_index + QS_PAN_TABLE_WET));
        }

        dry_val = clamp32(dry_val, -0x1fffffff, 0x1fffffff) << 2;
        wet     = clamp32(wet, -0x1fffffff, 0x1fffffff) << 2;

        wet = fir_apply(&qs->filter[ch], (int16_t)(wet >> 16));

        if (qs->state == QS_STATE_NORMAL2)
            dry_val = fir_apply(&qs->alt_filter[ch], (int16_t)(dry_val >> 16));

        int32_t output = delay_apply(&qs->wet[ch], wet) + delay_apply(&qs->dry[ch], dry_val);

        output = (output + 0x2000) & ~0x3fff;
        qs->out[ch] = (int16_t)clamp32(output >> 14, -0x7fff, 0x7fff);

        if (qs->delay_update) {
            delay_update(&qs->wet[ch]);
            delay_update(&qs->dry[ch]);
        }
    }

    qs->delay_update = 0;

    qs->state_counter++;
    if (qs->state_counter > 5) {
        qs->state_counter = 0;
        qs->state = qs->next_state;
    }
}

/* ── Register map initialization ────────────────────────────── */

static void init_register_map(qsound_t *qs) {
    int i;
    memset(qs->register_map, 0, sizeof(qs->register_map));

    /* PCM voices */
    for (i = 0; i < 16; i++) {
        qs->register_map[(i << 3) + 0] = &qs->voice[(i + 1) % 16].bank;
        qs->register_map[(i << 3) + 1] = (uint16_t *)&qs->voice[i].addr;
        qs->register_map[(i << 3) + 2] = &qs->voice[i].rate;
        qs->register_map[(i << 3) + 3] = &qs->voice[i].phase;
        qs->register_map[(i << 3) + 4] = (uint16_t *)&qs->voice[i].loop_len;
        qs->register_map[(i << 3) + 5] = (uint16_t *)&qs->voice[i].end_addr;
        qs->register_map[(i << 3) + 6] = (uint16_t *)&qs->voice[i].volume;
        qs->register_map[(i << 3) + 7] = NULL;
        qs->register_map[i + 0x80] = &qs->voice_pan[i];
        qs->register_map[i + 0xba] = (uint16_t *)&qs->voice[i].echo;
    }

    /* ADPCM voices */
    for (i = 0; i < 3; i++) {
        qs->register_map[(i << 2) + 0xca] = &qs->adpcm[i].start_addr;
        qs->register_map[(i << 2) + 0xcb] = &qs->adpcm[i].end_addr;
        qs->register_map[(i << 2) + 0xcc] = &qs->adpcm[i].bank;
        qs->register_map[(i << 2) + 0xcd] = (uint16_t *)&qs->adpcm[i].volume;
        qs->register_map[i + 0xd6] = &qs->adpcm[i].flag;
        qs->register_map[i + 0x90] = &qs->voice_pan[16 + i];
    }

    /* QSound registers */
    qs->register_map[0x93] = (uint16_t *)&qs->echo.feedback;
    qs->register_map[0xd9] = &qs->echo.end_pos;
    qs->register_map[0xe2] = &qs->delay_update;
    qs->register_map[0xe3] = &qs->next_state;

    for (i = 0; i < 2; i++) {
        qs->register_map[(i << 1) + 0xda] = &qs->filter[i].table_pos;
        qs->register_map[(i << 1) + 0xde] = (uint16_t *)&qs->wet[i].delay;
        qs->register_map[(i << 1) + 0xe4] = (uint16_t *)&qs->wet[i].volume;
        qs->register_map[(i << 1) + 0xdb] = &qs->alt_filter[i].table_pos;
        qs->register_map[(i << 1) + 0xdf] = (uint16_t *)&qs->dry[i].delay;
        qs->register_map[(i << 1) + 0xe5] = (uint16_t *)&qs->dry[i].volume;
    }
}

/* ── Public API ─────────────────────────────────────────────── */

void qsound_init(qsound_t *qs) {
    memset(qs, 0, sizeof(*qs));
    init_register_map(qs);
}

void qsound_reset(qsound_t *qs) {
    qs->ready_flag = 0;
    qs->out[0] = qs->out[1] = 0;
    qs->state = QS_STATE_BOOT;
    qs->state_counter = 0;
}

void qsound_load_dsp_rom(qsound_t *qs, const uint16_t *data, int count) {
    int n = count < 4096 ? count : 4096;
    memcpy(qs->dsp_rom, data, n * sizeof(uint16_t));
}

void qsound_set_sample_rom(qsound_t *qs, const uint8_t *data, uint32_t size) {
    qs->sample_rom = data;
    qs->sample_rom_size = size;
}

void qsound_write(qsound_t *qs, int offset, uint8_t data) {
    switch (offset) {
        case 0:
            qs->data_latch = (qs->data_latch & 0x00ff) | (data << 8);
            break;
        case 1:
            qs->data_latch = (qs->data_latch & 0xff00) | data;
            break;
        case 2: {
            uint16_t *dest = qs->register_map[data];
            if (dest)
                *dest = qs->data_latch;
            qs->ready_flag = 0;
            break;
        }
    }
}

uint8_t qsound_read(qsound_t *qs) {
    return (uint8_t)qs->ready_flag;
}

void qsound_update(qsound_t *qs) {
    switch (qs->state) {
        default:
        case QS_STATE_INIT1:
        case QS_STATE_INIT2:
            state_init(qs);
            break;
        case QS_STATE_REFRESH1:
            state_refresh_filter_1(qs);
            break;
        case QS_STATE_REFRESH2:
            state_refresh_filter_2(qs);
            break;
        case QS_STATE_NORMAL1:
        case QS_STATE_NORMAL2:
            state_normal_update(qs);
            break;
    }
}
