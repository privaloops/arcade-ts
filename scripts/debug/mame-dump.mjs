#!/usr/bin/env node
/**
 * MAME Memory Dump Tool
 *
 * Launches MAME with a Lua autoboot script that:
 * 1. Waits for the game to boot (self-test + title)
 * 2. Inserts coin + presses start
 * 3. Waits for gameplay
 * 4. Dumps palette VRAM, CPS-A/B registers, work RAM to JSON
 *
 * Usage:
 *   node scripts/debug/mame-dump.mjs <game> [--wait-boot <frames>] [--wait-gameplay <frames>] [--output <path>]
 *
 * Examples:
 *   node scripts/debug/mame-dump.mjs ghouls
 *   node scripts/debug/mame-dump.mjs ghouls --wait-boot 2400 --wait-gameplay 600
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const game = args[0];
if (!game) {
  console.error('Usage: node mame-dump.mjs <game> [--wait-boot <frames>] [--wait-gameplay <frames>] [--output <path>]');
  process.exit(1);
}

function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const waitBoot = parseInt(getArg('--wait-boot', '2400'), 10);     // ~40s for self-test + title
const waitGameplay = parseInt(getArg('--wait-gameplay', '600'), 10); // ~10s into gameplay
const outputPath = getArg('--output', `/tmp/mame-dump-${game}.json`);
const romPath = join(import.meta.dirname, '../../public');

// Memory regions to dump
// CPS1 memory map:
//   0x800100-0x80013F: CPS-A registers (64 bytes)
//   0x800140-0x80017F: CPS-B registers (64 bytes)
//   0x900000-0x92FFFF: VRAM (192KB)
//   0xFF0000-0xFFFFFF: Work RAM (64KB)
const DUMP_REGIONS = [
  { name: 'cpsa_regs', addr: 0x800100, size: 64 },
  { name: 'cpsb_regs', addr: 0x800140, size: 64 },
  { name: 'vram_palette', addr: 0x900000, size: 0x3000 },   // First 12KB (palette area)
  { name: 'vram_full', addr: 0x900000, size: 0x30000 },     // Full 192KB VRAM
  { name: 'work_ram', addr: 0xFF0000, size: 0x10000 },      // 64KB work RAM
];

// Generate MAME Lua script
function generateLuaScript() {
  return `
local count = 0
local state = "booting"  -- booting -> coin -> start -> playing -> dump
local coin_frame = 0

local function read_mem_region(mem, addr, size)
    local data = {}
    for i = 0, size - 1, 2 do
        local val = mem:read_u16(addr + i)
        data[#data + 1] = string.format("%04X", val)
    end
    return table.concat(data, "")
end

local function read_mem_bytes(mem, addr, size)
    local data = {}
    for i = 0, size - 1 do
        local val = mem:read_u8(addr + i)
        data[#data + 1] = string.format("%02X", val)
    end
    return table.concat(data, "")
end

local function dump_state()
    local cpu = manager.machine.devices[":maincpu"]
    local mem = cpu.spaces["program"]

    local f = io.open("${outputPath}", "w")
    f:write('{\\n')
    f:write('  "game": "${game}",\\n')
    f:write('  "frame": ' .. count .. ',\\n')
    f:write('  "source": "mame",\\n')

    -- Dump CPU state
    f:write('  "pc": ' .. cpu.state["PC"].value .. ',\\n')

    -- Dump memory regions
    local regions = {
        ${DUMP_REGIONS.map(r => `{ name = "${r.name}", addr = ${r.addr}, size = ${r.size} }`).join(',\n        ')}
    }

    f:write('  "regions": {\\n')
    for i, region in ipairs(regions) do
        local hex = read_mem_bytes(mem, region.addr, region.size)
        f:write('    "' .. region.name .. '": "' .. hex .. '"')
        if i < #regions then f:write(',') end
        f:write('\\n')
    end
    f:write('  }\\n')
    f:write('}\\n')
    f:close()

    print("[DUMP] Saved to ${outputPath} at frame " .. count)
    manager.machine:exit()
end

local function press_input(port_tag, field_name, press)
    local port = manager.machine.ioport.ports[port_tag]
    if not port then return end
    local field = port.fields[field_name]
    if not field then return end
    field:set_value(press and 1 or 0)
end

local function on_frame()
    count = count + 1

    if state == "booting" and count >= ${waitBoot} then
        print("[MAME] Boot done at frame " .. count .. ", inserting coin...")
        press_input(":IN0", "Coin 1", true)
        state = "coin"
        coin_frame = count
    elseif state == "coin" and count >= coin_frame + 10 then
        press_input(":IN0", "Coin 1", false)
        print("[MAME] Pressing start...")
        press_input(":IN0", "1 Player Start", true)
        state = "start"
        coin_frame = count
    elseif state == "start" and count >= coin_frame + 10 then
        press_input(":IN0", "1 Player Start", false)
        print("[MAME] Waiting for gameplay (" .. ${waitGameplay} .. " frames)...")
        state = "playing"
        coin_frame = count
    elseif state == "playing" and count >= coin_frame + ${waitGameplay} then
        print("[MAME] Dumping state...")
        dump_state()
    end
end

emu.add_machine_frame_notifier(on_frame)
print("[MAME] Lua dump script loaded. Boot wait: ${waitBoot} frames, gameplay wait: ${waitGameplay} frames")
`;
}

// Write Lua script
const luaPath = '/tmp/mame_dump_script.lua';
writeFileSync(luaPath, generateLuaScript());

console.log(`[mame-dump] Game: ${game}`);
console.log(`[mame-dump] Wait boot: ${waitBoot} frames (~${(waitBoot / 60).toFixed(0)}s)`);
console.log(`[mame-dump] Wait gameplay: ${waitGameplay} frames (~${(waitGameplay / 60).toFixed(0)}s)`);
console.log(`[mame-dump] Output: ${outputPath}`);

const mame = spawn('mame', [
  game,
  '-rompath', romPath,
  '-autoboot_script', luaPath,
  '-window', '-nomax',
  '-sound', 'none',
  '-skip_gameinfo',
  '-speed', '5',          // Run at 5x speed for faster dumping
], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

const timeout = setTimeout(() => {
  console.error('[mame-dump] Timeout (3 minutes). Killing MAME.');
  mame.kill();
  process.exit(1);
}, 180_000);

mame.stdout.on('data', (data) => process.stdout.write(data));
mame.stderr.on('data', (data) => process.stderr.write(data));

mame.on('close', (code) => {
  clearTimeout(timeout);
  try { unlinkSync(luaPath); } catch {}

  if (code !== 0) {
    console.error(`[mame-dump] MAME exited with code ${code}`);
    process.exit(1);
  }

  // Verify output
  try {
    const dump = JSON.parse(readFileSync(outputPath, 'utf-8'));
    console.log(`[mame-dump] Done! Frame ${dump.frame}, PC=0x${dump.pc.toString(16)}`);
    console.log(`[mame-dump] Regions: ${Object.keys(dump.regions).join(', ')}`);
  } catch (e) {
    console.error('[mame-dump] Failed to read output:', e.message);
    process.exit(1);
  }
});
