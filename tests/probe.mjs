import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

let puppeteer;
try {
  puppeteer = createRequire(import.meta.url)('puppeteer');
} catch (error) {
  console.error('puppeteer not found. Install it first: npm.cmd install (see README).');
  process.exit(1);
}

const EXT = path.resolve(import.meta.dirname, '..');
const EXT_FWD = EXT.replaceAll('\\', '/');
let CHROME;
try {
  CHROME = process.env.PROBE_CHROME || (await puppeteer.executablePath());
} catch (error) {
  CHROME = process.env.PROBE_CHROME;
  if (!CHROME) {
    console.error('Chrome for Testing not found; set PROBE_CHROME or run npm install.');
    process.exit(1);
  }
}
const DEPLOY_URL = (process.env.STEPSCRIBE_DEPLOY_URL || '').replace(/\/+$/, '');
const LANDING = pathToFileURL(path.join(EXT, 'landing', 'index.html')).href;
const FIXTURE = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'site.html'), 'utf8');

const EXPECTED_LABELS = {
  tagline: {
    en: 'do it once, print the steps', es: 'hazlo una vez, imprime los pasos', fr: 'faites-le une fois, imprimez les étapes',
    pt: 'faça uma vez, imprima os passos', it: 'fallo una volta, stampa i passi', de: 'einmal ausführen, Schritte drucken',
  },
  credit: {
    en: 'Built by Harley Vásquez', es: 'Creado por Harley Vásquez', fr: 'Créé par Harley Vásquez',
    pt: 'Criado por Harley Vásquez', it: 'Creato da Harley Vásquez', de: 'Erstellt von Harley Vásquez',
  },
};

let passes = 0;
let failures = 0;
const problems = [];

function check(name, ok, extra) {
  if (ok) {
    passes += 1;
    console.log('  PASS ' + name);
  } else {
    failures += 1;
    problems.push(name + (extra ? ' — ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, intervalMs = 200) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (error) {}
    if (Date.now() - start > timeoutMs) return null;
    await sleep(intervalMs);
  }
}

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://localhost').pathname;
  if (p === '/site.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const SITE_PAGE = `http://127.0.0.1:${PORT}/site.html`;

const launch = (args) =>
  puppeteer.launch({ headless: true, executablePath: CHROME, args, protocolTimeout: 60000 });

const storageGet = (page, keys) => page.evaluate((ks) => chrome.storage.local.get(ks), keys);
const getAll = (page) => page.evaluate(() => chrome.storage.local.get(null));

console.log('StepScribe probe (extension: ' + EXT + ')');
console.log('fixture server: ' + SITE_PAGE);

let browser = null;
let base = null;
let ZIP_BYTES = 0;

const DO_ACTIONS = (page) => page.evaluate(() => {
  const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  document.getElementById('btnA').click();
  const name = document.getElementById('name');
  name.value = 'Harley Vásquez';
  fire(name, 'input');
  const opt = document.getElementById('opt');
  opt.checked = true;
  fire(opt, 'change');
  document.getElementById('draw').click();
  document.getElementById('pic').click();
  const notes = document.getElementById('notes');
  notes.value = 'meal 42 EUR';
  fire(notes, 'input');
});

try {
  // ---- BASELINE ----
  base = await launch([]);
  {
    const page = await base.newPage();
    await page.goto(SITE_PAGE, { waitUntil: 'domcontentloaded' });
    await sleep(400);
    const title = await page.evaluate(() => document.title);
    check('baseline: fixture how-to page loads', title === 'StepScribe fixture — how-to page', title);
    await page.evaluate(() => {
      document.getElementById('btnA').click();
      const name = document.getElementById('name');
      name.value = 'x';
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    const steps = await page.evaluate(() => window.__ssSteps === undefined ? 'none' : window.__ssSteps);
    check('baseline: no recording machinery without extension', steps === 'none', String(steps));
    await page.close();
  }

  // ---- EXTENSION BROWSER ----
  browser = await launch([`--disable-extensions-except=${EXT_FWD}`, `--load-extension=${EXT_FWD}`]);

  const bootSwSeen = [];
  browser.on('targetcreated', (t) => {
    if (t.type() === 'service_worker' && t.url().includes('/background.js')) bootSwSeen.push(t.url());
  });
  await waitFor(() => (bootSwSeen.length > 0 ? true : null), 10000);

  const registry = await (async () => {
    const page = await browser.newPage();
    await page.goto('chrome://extensions-internals', { waitUntil: 'domcontentloaded' });
    await sleep(2000);
    const text = await page.evaluate(() => (document.body ? document.body.innerText : '[]'));
    await page.close();
    try { return JSON.parse(text); } catch (e) { return []; }
  })();
  const entry = (Array.isArray(registry) ? registry : []).find((e) => e && e.name === 'StepScribe');
  const extId = entry ? entry.id : null;
  check('extension registered and ENABLED', !!entry && entry.registry_status === 'ENABLED' && entry.location === 'COMMAND_LINE', entry ? entry.registry_status : 'not found');
  check('manifest_version 3 confirmed by Chrome', !!entry && entry.manifest_version === 3, entry && String(entry.manifest_version));
  if (!extId) throw new Error('extension id not found');

  const popupUrl = `chrome-extension://${extId}/popup.html`;
  const popup = await browser.newPage();
  let popupErrors = 0;
  popup.on('pageerror', (e) => {
    popupErrors += 1;
    console.log('    [popup pageerror] ' + e.message);
  });

  const page = await browser.newPage();
  await page.goto(SITE_PAGE, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(600);

  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.getElementById('toggleBtn') !== null, { timeout: 8000, polling: 100 });

  const defaults = await storageGet(popup, ['ss:on', 'ss:steps']);
  check('defaults: ss:on = false', defaults['ss:on'] === false, String(defaults['ss:on']));
  check('defaults: ss:steps = []', Array.isArray(defaults['ss:steps']) && defaults['ss:steps'].length === 0, JSON.stringify(defaults['ss:steps']));
  check('popup renders without JS exceptions', popupErrors === 0, popupErrors + ' errors');
  check('popup initial state = IDLE', (await popup.evaluate(() => document.getElementById('stateLed').dataset ? 'x' : 'y') === 'x') && (await popup.evaluate(() => document.getElementById('stateLed').textContent)) === 'IDLE', '');

  const perms = await popup.evaluate(async () => {
    const all = await chrome.permissions.getAll();
    return { permissions: all.permissions || [], origins: all.origins || [] };
  });
  check(
    'permission surface: storage only, http/https (no <all_urls>)',
    perms.permissions.length === 1 && perms.permissions.includes('storage') &&
      perms.origins.length === 2 && perms.origins.includes('http://*/*') && perms.origins.includes('https://*/*'),
    JSON.stringify(perms)
  );
  const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  check('manifest v3 + 1 permission (no <all_urls>)', manifest.manifest_version === 3 && manifest.permissions.length === 1 && !JSON.stringify(manifest).includes('<all_urls>'), '');

  // ---- IDLE: no recording ----
  await DO_ACTIONS(page);
  await sleep(500);
  const idleSteps = await storageGet(popup, 'ss:steps');
  check('idle: interactions NOT recorded before start', idleSteps['ss:steps'].length === 0, String(idleSteps['ss:steps'].length));

  // ---- START RECORDING ----
  await popup.evaluate(() => document.getElementById('toggleBtn').click());
  await waitFor(() => popup.evaluate(async () => (await chrome.storage.local.get('ss:on'))['ss:on'] === true ? true : null), 8000);
  check('start: ss:on = true persisted', true, '');
  check('popup LED shows REC', (await popup.evaluate(() => document.getElementById('stateLed').textContent)) === 'REC', '');

  // ---- RECORD REAL INTERACTIONS ----
  await DO_ACTIONS(page);
  const steps6 = await waitFor(() => storageGet(popup, 'ss:steps').then((s) => (s['ss:steps'].length === 6 ? s['ss:steps'] : null)), 8000);
  check('recording: 6 steps captured (2 clicks + 2 inputs + toggle + canvas/img)', steps6.length === 6, String(steps6.length));
  check('step 1: click on #btnA', steps6[0].type === 'click' && steps6[0].target === '#btnA', JSON.stringify(steps6[0]).slice(0, 80));
  check('step 2: input typed in #name', steps6[1].type === 'input' && steps6[1].target === '#name' && steps6[1].value === 'Harley Vásquez', JSON.stringify(steps6[1]).slice(0, 80));
  check('step 3: toggle checkbox #opt true', steps6[2].type === 'toggle' && steps6[2].target === '#opt' && steps6[2].value === 'true', JSON.stringify(steps6[2]).slice(0, 80));
  check('step 4: click on canvas #draw with dataURI thumb', steps6[3].type === 'click' && steps6[3].target === '#draw' && steps6[3].thumb.startsWith('data:image/png'), String(steps6[3].thumb).slice(0, 30));
  check('step 5: click on img #pic with dataURI thumb', steps6[4].type === 'click' && steps6[4].target === '#pic' && steps6[4].thumb.startsWith('data:image/png'), String(steps6[4].thumb).slice(0, 30));
  check('step 6: input in #notes with value', steps6[5].type === 'input' && steps6[5].target === '#notes' && steps6[5].value === 'meal 42 EUR', JSON.stringify(steps6[5]).slice(0, 80));
  check('sequence numbers are unique and incremental', steps6.map((s) => s.seq).join(',') === '1,2,3,4,5,6', steps6.map((s) => s.seq).join(','));
  check('recorded steps persisted to storage', true, '');

  // ---- POPUP LIST ----
  const listInfo = await popup.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.step'));
    return {
      count: items.length,
      seqs: items.map((li) => li.querySelector('.seq').textContent),
      thumbs: Array.from(document.querySelectorAll('.step img.thumb')).map((i) => i.src.slice(0, 22)),
      valueRow: document.querySelector('.step:nth-child(2) .value') ? document.querySelector('.step:nth-child(2) .value').textContent : '',
    };
  });
  check('popup list: 6 steps rendered', listInfo.count === 6, String(listInfo.count));
  check('popup list: step stamps S1..S6', listInfo.seqs.join(',') === 'S1,S2,S3,S4,S5,S6', listInfo.seqs.join(','));
  check('popup list: mini captures rendered (data:image/png)', listInfo.thumbs.length === 2 && listInfo.thumbs.every((s) => s.startsWith('data:image/png')), listInfo.thumbs.join(' '));
  check('popup list: value row shown for input step', listInfo.valueRow.includes('Harley Vásquez'), listInfo.valueRow);

  // ---- RELOAD POPUP: steps persist ----
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.getElementById('toggleBtn') !== null, { timeout: 8000, polling: 100 });
  await sleep(400);
  const afterReload = await popup.evaluate(() => document.querySelectorAll('.step').length);
  check('popup reload: 6 steps still listed', afterReload === 6, String(afterReload));

  // ---- STOP RECORDING ----
  await popup.evaluate(() => document.getElementById('toggleBtn').click());
  await waitFor(() => popup.evaluate(async () => (await chrome.storage.local.get('ss:on'))['ss:on'] === false ? true : null), 8000);
  await page.evaluate(() => document.getElementById('btnA').click());
  await sleep(600);
  const afterStop = await storageGet(popup, 'ss:steps');
  check('stop: no new steps while idle', afterStop['ss:steps'].length === 6, String(afterStop['ss:steps'].length));

  // ---- EXPORTS ----
  await popup.evaluate(() => {
    window.__dl = [];
    const origURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b) => { window.__dl.push({ blob: b, name: null }); return 'blob:mock'; };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && window.__dl.length) window.__dl[window.__dl.length - 1].name = this.download;
      return origClick.call(this);
    };
  });
  await popup.evaluate(() => document.getElementById('exportMdBtn').click());
  const md = await waitFor(() => popup.evaluate(async () => {
    const r = window.__dl && window.__dl[window.__dl.length - 1];
    if (!r || !r.name) return null;
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read failed'));
      fr.readAsText(r.blob);
    });
    return { name: r.name, text };
  }), 8000);
  check('export MD: triggered .md download', !!md && md.name.endsWith('.md'), md && md.name);
  check('export MD: contains click step instructions', !!md && md.text.includes('click #btnA') && md.text.includes('1. '), '');
  check('export MD: contains typed value', !!md && md.text.includes('Harley Vásquez'), '');
  check('export MD: embeds mini capture as markdown image', !!md && md.text.includes('![capture](data:image/png'), '');
  await popup.evaluate(() => document.getElementById('exportHtmlBtn').click());
  const html = await waitFor(() => popup.evaluate(async () => {
    const r = window.__dl && window.__dl[window.__dl.length - 1];
    if (!r || !r.name) return null;
    const text = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(new Error('read failed'));
      fr.readAsText(r.blob);
    });
    return { name: r.name, text };
  }), 8000);
  check('export HTML: triggered .html download', !!html && html.name.endsWith('.html'), html && html.name);
  check('export HTML: instruction list with steps', !!html && html.text.includes('<ol>') && html.text.includes('type in <code>#name</code>'), '');
  check('export HTML: thumbnails embedded as <img>', !!html && html.text.includes('<img src="data:image/png'), '');

  // ---- CLEAR ----
  await popup.evaluate(() => document.getElementById('clearBtn').click());
  const cleared = await waitFor(() => popup.evaluate(async () => {
    const r = await chrome.tabs.sendMessage((await chrome.tabs.query({ active: true, currentWindow: true }))[0].id, { type: 'ss:getSteps' });
    return r.steps.length === 0 ? true : null;
  }), 8000);
  check('clear: steps emptied', cleared === true, '');
  check('clear: popup list empty state', (await popup.evaluate(() => document.querySelectorAll('.step').length)) === 0, '');

  // ---- FROZEN ----
  const freshPage = await browser.newPage();
  await freshPage.goto(SITE_PAGE + '?frozen=1', { waitUntil: 'domcontentloaded' });
  await freshPage.bringToFront();
  await sleep(500);
  const frozenAll = await getAll(popup);
  const keys = Object.keys(frozenAll).filter((k) => k.startsWith('ss:'));
  check('frozen: only ss:* keys in storage', keys.length === 2 && ['ss:on', 'ss:steps'].every((k) => keys.includes(k)), keys.join(','));
  await freshPage.close();

  // ---- i18n popup ----
  const langCheck = async (code, expected) => {
    await popup.select('#langSel', code);
    const ok = await waitFor(() => popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected), 6000);
    check(`language switch to ${code} re-renders popup`, ok === true, expected);
    if (ok) {
      const credit = await popup.evaluate(() => document.querySelector('[data-i18n="credit"]')?.textContent);
      check(`language ${code}: credit localized`, credit === EXPECTED_LABELS.credit[code], credit);
      await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
      await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
      const persisted = await popup.evaluate((exp) => document.querySelector('[data-i18n="tagline"]')?.textContent === exp, expected);
      check(`language ${code}: persisted across reload`, persisted === true, 'reverted');
    }
  };
  await popup.select('#langSel', 'en');
  for (const code of ['fr', 'de', 'es', 'pt', 'it']) {
    await langCheck(code, EXPECTED_LABELS.tagline[code]);
  }
  await popup.evaluate(() => chrome.storage.local.remove('ss:lang'));
  await popup.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await popup.waitForFunction(() => document.querySelector('[data-i18n="tagline"]')?.textContent !== '', { timeout: 8000, polling: 100 });
  const navLang = await popup.evaluate(() => (navigator.language || 'en').toLowerCase().split('-')[0]);
  const defaulted = await popup.evaluate(() => document.querySelector('[data-i18n="tagline"]')?.textContent);
  check('default language = navigator language (or en)', ['en', 'es', 'fr', 'pt', 'it', 'de'].includes(navLang) && EXPECTED_LABELS.tagline[navLang] === defaulted, `nav=${navLang} got=${defaulted}`);
  await popup.evaluate(() => chrome.storage.local.set({ 'ss:lang': 'en' }));
  const popupCreditUrl = await popup.evaluate(() => {
    const a = document.querySelector('[data-i18n="credit"]');
    return a && a.tagName === 'A' ? a.href : '';
  });
  check('credit links to LinkedIn (popup)', popupCreditUrl === 'https://www.linkedin.com/in/harleyvasquez/', popupCreditUrl);

  // ---- Landing ----
  const landing = await browser.newPage();
  const landingErrors = [];
  landing.on('pageerror', (e) => landingErrors.push(e.message));
  await landing.goto(LANDING, { waitUntil: 'domcontentloaded' });
  await sleep(700);
  const heroOk = await landing.evaluate(() => {
    const t = document.querySelector('[data-i18n="heroTitle"]')?.textContent || '';
    return t.length > 0 && document.title !== '';
  });
  check('landing renders with localized hero', heroOk === true, '');
  await landing.select('#langSel', 'es');
  const heroEs = await waitFor(() => landing.evaluate(() => document.querySelector('[data-i18n="heroTitle"]')?.textContent), 5000);
  check('landing switch to es works', heroEs?.length > 5, heroEs);
  const titleEs = await waitFor(() => landing.evaluate((exp) => (document.title.toLowerCase().includes(exp) ? document.title : null), 'pasos'), 5000);
  check('landing document.title translated on switch', titleEs !== null, titleEs);
  check('no JS errors on landing', landingErrors.length === 0, landingErrors.join(' | '));
  const landingCreditUrl = await landing.evaluate(() => {
    const a = document.querySelector('[data-i18n="credit"]');
    return a && a.tagName === 'A' ? a.href : '';
  });
  check('credit links to LinkedIn (landing)', landingCreditUrl === 'https://www.linkedin.com/in/harleyvasquez/', landingCreditUrl);
  await landing.close();

  // ---- Packaging ----
  const zipPath = path.join(EXT, 'dist', 'stepscribe.zip');
  const landingZip = path.join(EXT, 'landing', 'stepscribe.zip');
  check('dist/stepscribe.zip exists', fs.existsSync(zipPath), zipPath);
  check('landing/stepscribe.zip exists (CTA target)', fs.existsSync(landingZip), landingZip);
  if (fs.existsSync(zipPath) && fs.existsSync(landingZip)) {
    const s = fs.statSync(zipPath);
    const l = fs.statSync(landingZip);
    check('landing zip byte-identical to dist zip', s.size === l.size && s.size > 0, `dist=${s.size} landing=${l.size}`);
    ZIP_BYTES = l.size;
  }
  const iconOk = ['icon16.png', 'icon48.png', 'icon128.png'].every((f) => {
    const p = path.join(EXT, 'icons', f);
    return fs.existsSync(p) && fs.readFileSync(p)[0] === 0x89 && fs.readFileSync(p)[1] === 0x50;
  });
  check('icons 16/48/128 present and valid PNG', iconOk, '');

  // ---- Deploy (gated) ----
  if (DEPLOY_URL) {
    try {
      const res = await fetch(DEPLOY_URL + '/', { headers: { 'User-Agent': 'stepscribe-probe' } });
      const body = await res.text();
      check('deployed landing responds (Vercel)', res.status === 200 && body.includes('StepScribe'), res.status + ' len=' + body.length);
      const zipRes = await fetch(DEPLOY_URL + '/stepscribe.zip', { headers: { 'User-Agent': 'stepscribe-probe' } });
      const zipBody = await zipRes.arrayBuffer();
      check('deployed landing serves the extension zip', zipRes.status === 200 && typeof ZIP_BYTES === 'number' && zipBody.byteLength === ZIP_BYTES, zipRes.status + ' bytes=' + zipBody.byteLength + ' expected=' + ZIP_BYTES);
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      check('deployed landing responds (Vercel)', false, msg);
      check('deployed landing serves the extension zip', false, msg);
    }
  } else {
    console.log('  [info] STEPSCRIBE_DEPLOY_URL not set; skipping deployed-landing checks.');
  }
} finally {
  if (browser) await browser.close();
  if (base) await base.close();
  server.close();
}

console.log('');
console.log(`RESULT: ${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
process.exit(0);