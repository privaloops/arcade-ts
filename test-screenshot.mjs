import { chromium } from 'playwright';

const WAIT_FRAMES = 800; // ~13 seconds at 60fps - enough to reach character select
const FRAME_MS = WAIT_FRAMES * 16.7;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

  await page.goto('http://localhost:5173/');

  // Wait for ROM to auto-load and game to boot past POST + attract
  console.log('Waiting for game to boot...');
  await page.waitForTimeout(15000);

  // Take title screen screenshot
  await page.screenshot({ path: '/tmp/cps1-title.png' });
  console.log('Title screen: /tmp/cps1-title.png');

  // Click to init audio, then insert coin + start
  await page.click('body');
  await page.waitForTimeout(500);

  // Insert coin
  await page.keyboard.down('Digit5');
  await page.waitForTimeout(100);
  await page.keyboard.up('Digit5');
  await page.waitForTimeout(1000);

  // Press Start (Enter) - hold it briefly
  await page.keyboard.down('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(6000);

  // Take character select screenshot
  await page.screenshot({ path: '/tmp/cps1-charselect.png' });
  console.log('Character select: /tmp/cps1-charselect.png');

  // Select character with A
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(100);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(8000);

  // Take fight screenshot
  await page.screenshot({ path: '/tmp/cps1-fight.png' });
  console.log('Fight: /tmp/cps1-fight.png');

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
