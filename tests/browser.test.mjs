import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

test('production UI: geometry, YAML validation/import/export, rotation, and mobile layout', { timeout: 60_000 }, async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], { windowsHide: true, stdio: 'pipe' });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview server did not start')), 15_000);
      server.stdout.on('data', data => { if (data.toString().includes('4178')) { clearTimeout(timer); resolve(); } });
      server.on('error', e => { clearTimeout(timer); reject(e); });
      server.on('exit', code => { clearTimeout(timer); reject(new Error(`Preview exited: ${code}`)); });
    });
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4178/');
    await page.locator('#chassis-name').waitFor();
    assert.match(page.url(), /\/chassis\.html$/);
    assert.equal(await page.locator('#chassis-name').textContent(), 'T90L91');
    assert.match(await page.locator('#parameter-tables').textContent(), /39.025/);
    assert.match(await page.locator('#metrics').textContent(), /166.73 mm/);
    const canvas = page.locator('canvas');
    const initialImage = await canvas.evaluate(c => c.toDataURL());
    assert.ok(initialImage.length > 10_000, 'canvas is drawn');
    await mkdir('outputs', { recursive: true });
    await page.screenshot({ path: 'outputs/chassis-desktop.png', fullPage: true });
    assert.equal(await page.locator('#review-panel').isVisible(), false);

    await page.locator('#chassis-select').selectOption('T100L101');
    assert.equal(await page.locator('#chassis-name').textContent(), 'T100L101');
    assert.match(await page.locator('#metrics').textContent(), /176.73 mm/);
    assert.match(await page.locator('#parameter-tables').textContent(), /92.6/);
    assert.match(await page.locator('#reference').getAttribute('href'), /T100L101/);
    assert.equal(await page.locator('#review-panel').isVisible(), false);
    await page.screenshot({ path: 'outputs/chassis-t100-desktop.png', fullPage: true });
    await page.locator('#yaml-tab').click();
    const second = await page.locator('#yaml-editor').inputValue();
    await page.locator('#yaml-editor').fill(second + '\n# Unsaved draft stays with this chassis\n');
    await page.locator('#chassis-select').selectOption('T90L91');
    await page.locator('#chassis-select').selectOption('T100L101');
    assert.match(await page.locator('#yaml-editor').inputValue(), /Unsaved draft stays/);
    await page.locator('#restore').click();
    assert.equal(await page.locator('#yaml-editor').inputValue(), second);
    const secondDownload = page.waitForEvent('download');
    await page.locator('#download').click();
    assert.equal((await secondDownload).suggestedFilename(), 'T100L101.yaml');
    await page.reload();
    await page.locator('#chassis-name').waitFor();
    assert.equal(await page.locator('#chassis-name').textContent(), 'T100L101');
    await page.locator('#chassis-select').selectOption('T90L91');

    await page.locator('#yaml-tab').click();
    const original = await page.locator('#yaml-editor').inputValue();
    await page.locator('#yaml-editor').fill(original.replace('units: mm', 'units: cm'));
    await page.locator('#apply').click();
    assert.match(await page.locator('#error').textContent(), /units: must be mm/);
    assert.equal(await canvas.evaluate(c => c.toDataURL()), initialImage, 'invalid input retains last valid view');

    await page.locator('#yaml-editor').fill(original.replace('name: T90L91', 'name: Edited chassis').replace('x_mm: 91', 'x_mm: 100'));
    await page.locator('#apply').click();
    assert.equal(await page.locator('#chassis-name').textContent(), 'Edited chassis');
    assert.equal(await page.locator('#error').isVisible(), false);
    assert.match(await page.locator('#metrics').textContent(), /100 mm/);

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#download').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'Edited_chassis.yaml');
    const saved = await readFile(await download.path(), 'utf8');
    assert.match(saved, /name: Edited chassis/);
    assert.match(saved, /y_mm: 39.025/);

    await page.locator('#import').setInputFiles({ name: 'roundtrip.yaml', mimeType: 'text/yaml', buffer: Buffer.from(saved) });
    assert.equal(await page.locator('#chassis-name').textContent(), 'Edited chassis');
    await page.locator('#restore').click();
    await page.locator('#heading').fill('0');
    assert.notEqual(await canvas.evaluate(c => c.toDataURL()), initialImage);
    await page.locator('#reset-view').click();
    assert.equal(await page.locator('#heading').inputValue(), '90');

    const imageDownload = page.waitForEvent('download');
    await page.locator('#export-png').click();
    assert.equal((await imageDownload).suggestedFilename(), 'T90L91.png');
    await page.locator('#parameters-tab').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'outputs/chassis-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no mobile horizontal overflow');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
  }
});
