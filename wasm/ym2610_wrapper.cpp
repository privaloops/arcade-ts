/**
 * YM2610 WASM wrapper using ymfm by Aaron Giles (BSD-3-Clause)
 *
 * Provides a C API for use from JavaScript/TypeScript via Emscripten.
 * The YM2610 has: 4ch FM + 3ch SSG + 6ch ADPCM-A + 1ch ADPCM-B.
 *
 * ymfm generate() produces 3 outputs:
 *   data[0] = FM left (stereo), data[1] = FM right, data[2] = SSG (mono)
 * We mix them into a stereo pair for the audio output.
 */

#include <emscripten.h>
#include <cstring>
#include <cstdint>
#include "ymfm/ymfm_opn.h"

class NeoGeoYmInterface : public ymfm::ymfm_interface {
public:
    uint8_t* adpcm_a_rom = nullptr;
    uint32_t adpcm_a_rom_size = 0;
    uint8_t* adpcm_b_rom = nullptr;
    uint32_t adpcm_b_rom_size = 0;

    // Single ROM pointer for combined V-ROM
    uint8_t* combined_rom = nullptr;
    uint32_t combined_rom_size = 0;

    virtual uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override {
        // Both ADPCM-A and ADPCM-B read from the same combined V-ROM
        if (type == ymfm::ACCESS_ADPCM_A || type == ymfm::ACCESS_ADPCM_B) {
            if (combined_rom && address < combined_rom_size)
                return combined_rom[address];
            return 0;
        }
        return 0;
    }

    virtual void ymfm_external_write(ymfm::access_class, uint32_t, uint8_t) override {
        // V-ROM is read-only
    }

    virtual void ymfm_set_timer(uint32_t tnum, int32_t duration) override {
        timer_active[tnum] = (duration >= 0);
        timer_duration[tnum] = duration;
    }

    virtual void ymfm_update_irq(bool asserted) override {
        irq_state = asserted;
    }

    virtual bool ymfm_is_busy() override { return false; }

    bool irq_state = false;
    bool timer_active[2] = {false, false};
    int32_t timer_duration[2] = {0, 0};
};

static NeoGeoYmInterface ym_interface;
static ymfm::ym2610* ym_chip = nullptr;

#define SAMPLE_BUF_SIZE 4096
static float sample_buf_l[SAMPLE_BUF_SIZE];
static float sample_buf_r[SAMPLE_BUF_SIZE];
static int sample_buf_pos = 0;
static int clock_counter = 0;
// YM2610 output rate = clock / 144 = 8MHz / 144 = 55556 Hz
#define CLOCKS_PER_SAMPLE 144

extern "C" {

EMSCRIPTEN_KEEPALIVE
void ym2610_init() {
    if (ym_chip) delete ym_chip;
    ym_chip = new ymfm::ym2610(ym_interface);
    ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_reset() {
    if (ym_chip) ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_set_rom(uint8_t* rom_ptr, uint32_t rom_size) {
    ym_interface.combined_rom = rom_ptr;
    ym_interface.combined_rom_size = rom_size;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_write(uint32_t port, uint8_t data) {
    // port 0=addr low, 1=data low, 2=addr high, 3=data high
    if (ym_chip) ym_chip->write(port & 3, data);
}

EMSCRIPTEN_KEEPALIVE
uint8_t ym2610_read(uint32_t port) {
    if (!ym_chip) return 0;
    return ym_chip->read(port & 3);
}

EMSCRIPTEN_KEEPALIVE
int ym2610_generate(int num_samples) {
    if (!ym_chip) return 0;
    ymfm::ym2610::output_data output;
    int generated = 0;
    for (int i = 0; i < num_samples && sample_buf_pos < SAMPLE_BUF_SIZE; i++) {
        ym_chip->generate(&output, 1);
        // Mix: FM stereo (data[0], data[1]) + SSG mono (data[2])
        float fm_l = output.data[0] / 32768.0f;
        float fm_r = output.data[1] / 32768.0f;
        float ssg = output.data[2] / 32768.0f * 0.5f; // SSG is quieter
        sample_buf_l[sample_buf_pos] = fm_l + ssg;
        sample_buf_r[sample_buf_pos] = fm_r + ssg;
        sample_buf_pos++;
        generated++;
    }
    return generated;
}

EMSCRIPTEN_KEEPALIVE
int ym2610_clock_cycles(int num_cycles) {
    if (!ym_chip) return 0;
    int irq_flags = 0;
    ymfm::ym2610::output_data output;
    for (int c = 0; c < num_cycles; c++) {
        bool irq_before = ym_interface.irq_state;
        clock_counter++;
        if (clock_counter >= CLOCKS_PER_SAMPLE) {
            clock_counter = 0;
            ym_chip->generate(&output, 1);
            if (sample_buf_pos < SAMPLE_BUF_SIZE) {
                float fm_l = output.data[0] / 32768.0f;
                float fm_r = output.data[1] / 32768.0f;
                float ssg = output.data[2] / 32768.0f * 0.5f;
                sample_buf_l[sample_buf_pos] = fm_l + ssg;
                sample_buf_r[sample_buf_pos] = fm_r + ssg;
                sample_buf_pos++;
            }
        }
        bool irq_after = ym_interface.irq_state;
        if (!irq_before && irq_after) irq_flags |= 1;  // IRQ asserted
        if (irq_before && !irq_after) irq_flags |= 2;  // IRQ cleared
    }
    return irq_flags;
}

EMSCRIPTEN_KEEPALIVE int ym2610_get_sample_count() { return sample_buf_pos; }
EMSCRIPTEN_KEEPALIVE float* ym2610_get_samples_l() { return sample_buf_l; }
EMSCRIPTEN_KEEPALIVE float* ym2610_get_samples_r() { return sample_buf_r; }

EMSCRIPTEN_KEEPALIVE
void ym2610_drain_samples(int count) {
    if (count >= sample_buf_pos) { sample_buf_pos = 0; return; }
    memmove(sample_buf_l, sample_buf_l + count, (sample_buf_pos - count) * sizeof(float));
    memmove(sample_buf_r, sample_buf_r + count, (sample_buf_pos - count) * sizeof(float));
    sample_buf_pos -= count;
}

EMSCRIPTEN_KEEPALIVE int ym2610_get_sample_rate() { return 55556; }

EMSCRIPTEN_KEEPALIVE
uint8_t* ym2610_alloc_rom(uint32_t size) {
    uint8_t* ptr = new uint8_t[size];
    memset(ptr, 0, size);
    ym2610_set_rom(ptr, size);
    return ptr;
}

EMSCRIPTEN_KEEPALIVE
bool ym2610_get_irq() { return ym_interface.irq_state; }

} // extern "C"
