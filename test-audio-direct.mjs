import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false }); // visible pour entendre
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(15000); // wait for boot

  // Click to init audio
  await page.click('body');
  await page.waitForTimeout(1000);

  // Insert coin + start
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(100);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(1000);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(3000);

  // Capture 5 seconds of YM2151 output and play it back at correct speed
  const result = await page.evaluate(async () => {
    const emu = (window).__emulator;
    if (!emu) return 'no emulator';

    const ym = emu.getYm2151();
    const rate = ym.getSampleRate(); // 55930
    const duration = 5; // seconds
    const totalSamples = rate * duration;

    const bufL = new Float32Array(totalSamples);
    const bufR = new Float32Array(totalSamples);

    // Generate 5 seconds of audio (300 frames at 60fps)
    const samplesPerFrame = Math.ceil(rate / 59.637);
    let offset = 0;
    for (let f = 0; f < 300 && offset < totalSamples; f++) {
      const count = Math.min(samplesPerFrame, totalSamples - offset);
      ym.generateSamples(bufL, bufR, count, offset);
      offset += count;
    }

    // Play it back using AudioBuffer at the YM2151 sample rate
    const ctx = new AudioContext({ sampleRate: rate });
    const audioBuffer = ctx.createBuffer(2, totalSamples, rate);
    audioBuffer.getChannelData(0).set(bufL);
    audioBuffer.getChannelData(1).set(bufR);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();

    // Count non-zero
    let nz = 0;
    for (let i = 0; i < totalSamples; i++) if (Math.abs(bufL[i]) > 0.001) nz++;

    return { rate, totalSamples, nonZero: nz, offset };
  });

  console.log('Result:', JSON.stringify(result));

  // Keep browser open to hear the audio
  await page.waitForTimeout(10000);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
