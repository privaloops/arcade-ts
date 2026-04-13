/**
 * YM2610 WASM wrapper using ymfm by Aaron Giles (BSD-3-Clause)
 *
 * Provides a C API for use from JavaScript/TypeScript via Emscripten.
 * The YM2610 has: 4ch FM + 3ch SSG + 6ch ADPCM-A + 1ch ADPCM-B.
 *
 * ymfm uses EXTERNAL timer handling: it calls ymfm_set_timer() to request
 * a callback after N clocks. We track the countdown in clock_cycles() and
 * call engine_timer_expired() when the timer fires.
 */

#include <emscripten.h>
#include <cstring>
#include <cstdint>
#include "ymfm/ymfm_opn.h"

class NeoGeoYmInterface : public ymfm::ymfm_interface {
public:
    // V-ROM for ADPCM-A and ADPCM-B (concatenated: A first, then B)
    uint8_t* combined_rom = nullptr;
    uint32_t combined_rom_size = 0;
    // ADPCM-A occupies [0..adpcm_a_size), ADPCM-B occupies [adpcm_a_size..combined_rom_size)
    // For games with no split (single V-ROM), adpcm_a_size = combined_rom_size
    uint32_t adpcm_a_size = 0;

    // Timer tracking (ymfm external timer model)
    bool timer_active[2] = {false, false};
    int32_t timer_counter[2] = {0, 0};
    int32_t timer_period[2] = {0, 0};
    bool irq_state = false;

    virtual uint8_t ymfm_external_read(ymfm::access_class type, uint32_t address) override {
        if (!combined_rom) return 0;
        if (type == ymfm::ACCESS_ADPCM_A) {
            // ADPCM-A reads from [0..adpcm_a_size)
            if (address < adpcm_a_size)
                return combined_rom[address];
            return 0;
        }
        if (type == ymfm::ACCESS_ADPCM_B) {
            // ADPCM-B reads from [adpcm_a_size..combined_rom_size)
            uint32_t rom_addr = adpcm_a_size + address;
            if (rom_addr < combined_rom_size)
                return combined_rom[rom_addr];
            return 0;
        }
        return 0;
    }

    virtual void ymfm_external_write(ymfm::access_class, uint32_t, uint8_t) override {}

    virtual void ymfm_set_timer(uint32_t tnum, int32_t duration_in_clocks) override {
        if (tnum > 1) return;
        if (duration_in_clocks < 0) {
            timer_active[tnum] = false;
            timer_counter[tnum] = 0;
            timer_period[tnum] = 0;
        } else {
            timer_active[tnum] = true;
            timer_counter[tnum] = duration_in_clocks;
            timer_period[tnum] = duration_in_clocks;
        }
    }

    virtual void ymfm_update_irq(bool asserted) override {
        irq_state = asserted;
    }

    virtual bool ymfm_is_busy() override { return false; }

    // Tick timers by N clocks, call engine_timer_expired when they fire.
    // After expiry, ymfm re-arms via ymfm_set_timer() which resets counter.
    void tick_timers(int clocks) {
        for (int t = 0; t < 2; t++) {
            if (!timer_active[t]) continue;
            timer_counter[t] -= clocks;
            if (timer_counter[t] <= 0) {
                int32_t remainder = timer_counter[t]; // ≤ 0
                m_engine->engine_timer_expired(t);
                // ymfm re-armed: counter was set fresh. Adjust for overshoot.
                if (timer_active[t] && timer_counter[t] > 0) {
                    timer_counter[t] += remainder;
                }
            }
        }
    }
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
    // MIN fidelity: generate() outputs at clock/144 = 55556 Hz (not clock/16 = 500 kHz)
    ym_chip->set_fidelity(ymfm::OPN_FIDELITY_MIN);
    ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_reset() {
    if (ym_chip) ym_chip->reset();
    sample_buf_pos = 0;
    clock_counter = 0;
    for (int t = 0; t < 2; t++) {
        ym_interface.timer_active[t] = false;
        ym_interface.timer_counter[t] = 0;
        ym_interface.timer_period[t] = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
void ym2610_set_rom(uint8_t* rom_ptr, uint32_t rom_size) {
    ym_interface.combined_rom = rom_ptr;
    ym_interface.combined_rom_size = rom_size;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_write(uint32_t port, uint8_t data) {
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
        output.clear();
        ym_chip->generate(&output, 1);
        float fm_l = output.data[0] / 32768.0f;
        float fm_r = output.data[1] / 32768.0f;
        float ssg = output.data[2] / 32768.0f * 0.20f;
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

    // Tick timers and generate samples together (synchronized)
    for (int c = 0; c < num_cycles; c++) {
        bool irq_before = ym_interface.irq_state;
        ym_interface.tick_timers(1);
        bool irq_after = ym_interface.irq_state;
        if (!irq_before && irq_after) irq_flags |= 1;
        if (irq_before && !irq_after) irq_flags |= 2;

        clock_counter++;
        if (clock_counter >= CLOCKS_PER_SAMPLE) {
            clock_counter = 0;
            output.clear();
            ym_chip->generate(&output, 1);
            if (sample_buf_pos < SAMPLE_BUF_SIZE) {
                float fm_l = output.data[0] / 32768.0f;
                float fm_r = output.data[1] / 32768.0f;
                float ssg = output.data[2] / 32768.0f * 0.20f;
                sample_buf_l[sample_buf_pos] = fm_l + ssg;
                sample_buf_r[sample_buf_pos] = fm_r + ssg;
                sample_buf_pos++;
            }
        }
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
    // Default: single pool (no ADPCM-B split)
    ym_interface.adpcm_a_size = size;
    return ptr;
}

EMSCRIPTEN_KEEPALIVE
void ym2610_set_adpcm_a_size(uint32_t size) {
    ym_interface.adpcm_a_size = size;
}

EMSCRIPTEN_KEEPALIVE
bool ym2610_get_irq() { return ym_interface.irq_state; }

} // extern "C"
