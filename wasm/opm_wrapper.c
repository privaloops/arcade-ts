/**
 * Nuked OPM WASM wrapper
 * Exposes the minimal API needed by the CPS1 emulator.
 */

#include "opm.h"
#include <emscripten.h>
#include <string.h>

static opm_t chip;
static int32_t output[2];
static uint8_t sh1, sh2;

// Sample buffer for external timer mode
#define SAMPLE_BUF_SIZE 2048
static float sample_buf_l[SAMPLE_BUF_SIZE];
static float sample_buf_r[SAMPLE_BUF_SIZE];
static int sample_buf_write_pos = 0;
static int clock_counter = 0;

#define OPM_CLOCKS_PER_SAMPLE 32

// IRQ state tracking
static int prev_timer_irq = 0;

EMSCRIPTEN_KEEPALIVE
void opm_init(void) {
    memset(&chip, 0, sizeof(chip));
    OPM_Reset(&chip, 0);
    sample_buf_write_pos = 0;
    clock_counter = 0;
    prev_timer_irq = 0;
}

EMSCRIPTEN_KEEPALIVE
void opm_reset(void) {
    OPM_Reset(&chip, 0);
    sample_buf_write_pos = 0;
    clock_counter = 0;
    prev_timer_irq = 0;
}

EMSCRIPTEN_KEEPALIVE
void opm_write_address(int value) {
    OPM_Write(&chip, 0, (uint8_t)(value & 0xFF));
}

EMSCRIPTEN_KEEPALIVE
void opm_write_data(int value) {
    OPM_Write(&chip, 1, (uint8_t)(value & 0xFF));
}

EMSCRIPTEN_KEEPALIVE
int opm_read_status(void) {
    return OPM_Read(&chip, 1);
}

EMSCRIPTEN_KEEPALIVE
int opm_read_irq(void) {
    return OPM_ReadIRQ(&chip);
}

/**
 * Clock the chip for N cycles, collecting samples and tracking IRQ.
 * Returns: IRQ transition flags (bit 0 = IRQ asserted, bit 1 = IRQ cleared)
 */
EMSCRIPTEN_KEEPALIVE
int opm_clock_cycles(int num_cycles) {
    int irq_flags = 0;

    for (int c = 0; c < num_cycles; c++) {
        int irq_before = chip.timer_irq;
        uint8_t so;
        OPM_Clock(&chip, output, &sh1, &sh2, &so);

        // Collect sample every 32 OPM clocks
        if (++clock_counter >= OPM_CLOCKS_PER_SAMPLE) {
            clock_counter = 0;
            if (sample_buf_write_pos < SAMPLE_BUF_SIZE) {
                sample_buf_l[sample_buf_write_pos] = chip.dac_output[0] / 32768.0f;
                sample_buf_r[sample_buf_write_pos] = chip.dac_output[1] / 32768.0f;
                sample_buf_write_pos++;
            }
        }

        // Track IRQ transitions
        int irq_after = chip.timer_irq;
        if (!irq_before && irq_after) {
            irq_flags |= 1; // IRQ asserted
            if (chip.timer_a_status) irq_flags |= 4;  // Timer A
            if (chip.timer_b_status) irq_flags |= 8;  // Timer B
        } else if (irq_before && !irq_after) {
            irq_flags |= 2; // IRQ cleared
        }
    }

    return irq_flags;
}

/**
 * Get number of samples available in the buffer.
 */
EMSCRIPTEN_KEEPALIVE
int opm_get_sample_count(void) {
    return sample_buf_write_pos;
}

/**
 * Get pointer to left sample buffer (for direct memory access from JS).
 */
EMSCRIPTEN_KEEPALIVE
float* opm_get_samples_l(void) {
    return sample_buf_l;
}

/**
 * Get pointer to right sample buffer.
 */
EMSCRIPTEN_KEEPALIVE
float* opm_get_samples_r(void) {
    return sample_buf_r;
}

/**
 * Reset the sample buffer write position (call after reading samples).
 */
EMSCRIPTEN_KEEPALIVE
void opm_drain_samples(int count) {
    // Shift remaining samples to front
    int excess = sample_buf_write_pos - count;
    if (excess > 0) {
        memmove(sample_buf_l, sample_buf_l + count, excess * sizeof(float));
        memmove(sample_buf_r, sample_buf_r + count, excess * sizeof(float));
    }
    sample_buf_write_pos = excess > 0 ? excess : 0;
}

EMSCRIPTEN_KEEPALIVE
int opm_get_sample_rate(void) {
    return 55930; // 3579545 / 64
}
