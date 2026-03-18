/**
 * Playwright script to diagnose YM2151 audio issues.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const YM_RATE = 55930;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

  // Capture ALL console logs
  page.on('console', msg => {
    console.log('[PAGE]', msg.text());
  });

  await page.goto('http://localhost:5173/');

  console.log('Waiting for game to boot (18s)...');
  await page.waitForTimeout(18000);

  // Click to init audio
  await page.click('body');
  await page.waitForTimeout(500);

  // Check YM2151 state
  console.log('\n=== YM2151 Diagnostic ===');
  const diag = await page.evaluate(() => {
    const emu = window.__emulator;
    if (!emu) return { error: 'no emulator' };
    const ym = emu.getYm2151();

    // Access private channels via property access (JS doesn't enforce private)
    const channels = ym['channels'] || ym._channels || ym.channels;
    if (!channels) return { error: 'cannot access channels' };

    const channelInfo = [];
    for (let ch = 0; ch < 8; ch++) {
      const channel = channels[ch];
      const ops = channel.ops;
      const opInfo = [];
      for (let op = 0; op < 4; op++) {
        const o = ops[op];
        opInfo.push({
          envPhase: o.envPhase,
          envLevel: o.envLevel,
          keyOn: o.keyOn,
          phaseInc: o.phaseInc,
          totalLevel: o.totalLevel,
          ar: o.ar,
          d1r: o.d1r,
          rr: o.rr,
          mul: o.mul,
          dt1: o.dt1,
          dt2: o.dt2,
        });
      }
      channelInfo.push({
        algorithm: channel.algorithm,
        feedback: channel.feedback,
        keyCode: channel.keyCode,
        keyFraction: channel.keyFraction,
        blockFreq: channel.blockFreq,
        leftEnable: channel.leftEnable,
        rightEnable: channel.rightEnable,
        ops: opInfo,
      });
    }

    // Also generate a small buffer and check
    const testL = new Float32Array(512);
    const testR = new Float32Array(512);
    ym.generateSamples(testL, testR, 512);
    let nz = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < 512; i++) {
      if (testL[i] !== 0) nz++;
      if (testL[i] < min) min = testL[i];
      if (testL[i] > max) max = testL[i];
    }

    // Read some registers
    const regs = ym['registers'];
    const regDump = {};
    for (let r = 0; r < 256; r++) {
      if (regs[r] !== 0) regDump['0x' + r.toString(16).padStart(2, '0')] = '0x' + regs[r].toString(16).padStart(2, '0');
    }

    return {
      channels: channelInfo,
      testBuffer: { nonZero: nz, min, max },
      nonZeroRegs: Object.keys(regDump).length,
      regDump,
    };
  });

  if (diag.error) {
    console.log('Error:', diag.error);
  } else {
    console.log('Non-zero registers:', diag.nonZeroRegs);
    console.log('Test buffer: nonZero=' + diag.testBuffer.nonZero + '/512, range=[' + diag.testBuffer.min.toFixed(6) + ', ' + diag.testBuffer.max.toFixed(6) + ']');

    // Print channel states
    for (let ch = 0; ch < 8; ch++) {
      const c = diag.channels[ch];
      const activeOps = c.ops.filter(o => o.envPhase !== 4).length; // 4 = Off
      const keyOnOps = c.ops.filter(o => o.keyOn).length;
      console.log(`  Ch${ch}: algo=${c.algorithm} fb=${c.feedback} KC=0x${c.keyCode.toString(16)} KF=${c.keyFraction} L=${c.leftEnable?1:0} R=${c.rightEnable?1:0} active=${activeOps} keyOn=${keyOnOps}`);
      for (let op = 0; op < 4; op++) {
        const o = c.ops[op];
        if (o.envPhase !== 4 || o.phaseInc !== 0 || o.keyOn) {
          console.log(`    Op${op}: phase=${o.envPhase} envLvl=${o.envLevel} keyOn=${o.keyOn} phaseInc=${o.phaseInc} TL=${o.totalLevel} AR=${o.ar} MUL=${o.mul} DT1=${o.dt1} DT2=${o.dt2}`);
        }
      }
    }

    // Print interesting registers
    console.log('\nNon-zero registers:');
    const entries = Object.entries(diag.regDump).sort();
    for (const [reg, val] of entries.slice(0, 50)) {
      console.log(`  ${reg} = ${val}`);
    }
    if (entries.length > 50) console.log('  ... and ' + (entries.length - 50) + ' more');
  }

  // Now insert coin, start, select character, and check again
  console.log('\n=== After game start ===');
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(100);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(2000);

  await page.keyboard.down('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(5000);

  await page.keyboard.down('KeyA');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(6000);

  // Check again
  const diag2 = await page.evaluate(() => {
    const emu = window.__emulator;
    const ym = emu.getYm2151();
    const channels = ym['channels'];

    const channelInfo = [];
    for (let ch = 0; ch < 8; ch++) {
      const c = channels[ch];
      const opInfo = [];
      for (let op = 0; op < 4; op++) {
        const o = c.ops[op];
        opInfo.push({
          envPhase: o.envPhase,
          envLevel: o.envLevel,
          keyOn: o.keyOn,
          phaseInc: o.phaseInc,
          totalLevel: o.totalLevel,
          ar: o.ar,
          d1r: o.d1r,
          rr: o.rr,
          mul: o.mul,
        });
      }
      channelInfo.push({
        algorithm: c.algorithm,
        feedback: c.feedback,
        keyCode: c.keyCode,
        keyFraction: c.keyFraction,
        blockFreq: c.blockFreq,
        leftEnable: c.leftEnable,
        rightEnable: c.rightEnable,
        ops: opInfo,
      });
    }

    // Generate longer buffer
    const testL = new Float32Array(4096);
    const testR = new Float32Array(4096);
    ym.generateSamples(testL, testR, 4096);
    let nz = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < 4096; i++) {
      if (testL[i] !== 0) nz++;
      if (testL[i] < min) min = testL[i];
      if (testL[i] > max) max = testL[i];
    }

    return { channels: channelInfo, testBuffer: { nonZero: nz, min, max } };
  });

  console.log('Test buffer: nonZero=' + diag2.testBuffer.nonZero + '/4096, range=[' + diag2.testBuffer.min.toFixed(6) + ', ' + diag2.testBuffer.max.toFixed(6) + ']');

  for (let ch = 0; ch < 8; ch++) {
    const c = diag2.channels[ch];
    const activeOps = c.ops.filter(o => o.envPhase !== 4).length;
    const keyOnOps = c.ops.filter(o => o.keyOn).length;
    if (activeOps > 0 || keyOnOps > 0 || c.keyCode !== 0) {
      console.log(`  Ch${ch}: algo=${c.algorithm} fb=${c.feedback} KC=0x${c.keyCode.toString(16)} KF=${c.keyFraction} BF=0x${c.blockFreq.toString(16)} L=${c.leftEnable?1:0} R=${c.rightEnable?1:0} active=${activeOps} keyOn=${keyOnOps}`);
      for (let op = 0; op < 4; op++) {
        const o = c.ops[op];
        console.log(`    Op${op}: envPhase=${o.envPhase} envLvl=${o.envLevel} keyOn=${o.keyOn} phaseInc=${o.phaseInc} TL=${o.totalLevel} AR=${o.ar} MUL=${o.mul}`);
      }
    }
  }

  // Save a WAV for listening
  const CAPTURE_SECS = 5;
  const numSamples = CAPTURE_SECS * YM_RATE;
  const allLeft = [];
  const allRight = [];
  const CHUNK_SIZE = 16384;

  for (let offset = 0; offset < numSamples; offset += CHUNK_SIZE) {
    const chunkLen = Math.min(CHUNK_SIZE, numSamples - offset);
    const chunk = await page.evaluate((len) => {
      const ym = window.__emulator.getYm2151();
      const left = new Float32Array(len);
      const right = new Float32Array(len);
      ym.generateSamples(left, right, len);
      return { left: Array.from(left), right: Array.from(right) };
    }, chunkLen);
    allLeft.push(...chunk.left);
    allRight.push(...chunk.right);
  }

  let nz = 0, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < allLeft.length; i++) {
    if (allLeft[i] !== 0) nz++;
    if (allLeft[i] < minV) minV = allLeft[i];
    if (allLeft[i] > maxV) maxV = allLeft[i];
  }
  console.log(`\nWAV capture: ${allLeft.length} samples, nonZero=${nz} (${(nz/allLeft.length*100).toFixed(1)}%), range=[${minV.toFixed(6)}, ${maxV.toFixed(6)}]`);

  writeWav('/tmp/cps1-ym2151-capture.wav', allLeft, allRight, YM_RATE);
  console.log('WAV saved to: /tmp/cps1-ym2151-capture.wav');

  await browser.close();
}

function writeWav(path, leftData, rightData, sampleRate) {
  const numSamples = leftData.length;
  const bitsPerSample = 16;
  const numChannels = 2;
  const dataSize = numSamples * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28);
  buffer.writeUInt16LE(numChannels * 2, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const l = Math.max(-1, Math.min(1, leftData[i] || 0));
    const r = Math.max(-1, Math.min(1, rightData[i] || 0));
    buffer.writeInt16LE(Math.round(l * 32767), offset); offset += 2;
    buffer.writeInt16LE(Math.round(r * 32767), offset); offset += 2;
  }
  fs.writeFileSync(path, buffer);
}

main().catch(e => { console.error(e); process.exit(1); });
