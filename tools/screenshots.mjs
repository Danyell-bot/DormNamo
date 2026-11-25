// Captures README screenshots from the live site.
// Setup:  npm i -D playwright && npx playwright install chromium
// Run:    node tools/screenshots.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] || 'https://dormnamoph.github.io/DormNamo/').replace(/\/?$/, '/');
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });

const pages = [
  ['rooms', ''],
  ['discover', 'discover/'],
  ['my-listings', 'my-listings/'],
  ['people', 'people/'],
  ['messages', 'messages/'],
  ['about', 'about/'],
];

// Click the first visible button matching any of the labels, if one shows up.
async function clickIfShown(page, labels) {
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

for (const [name, path] of pages) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  // Cookie choice, then guest login, then skip onboarding if they appear.
  await clickIfShown(page, [/essential only/i, /guest/i, /skip/i]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', `${out}/${name}.png`);
}

await browser.close();
