# StepScribe

**Do it once, print the steps.** StepScribe turns what you do on a page into a numbered instruction sheet: clicks become `click #selector` steps, typed values are recorded per field, and when you click an image/canvas/video a **mini capture** of the element is embedded (real `drawImage` rasterization into a tiny thumbnail). The popup lists every step with a sequence stamp; export downloads Markdown or a self-contained HTML page.

Landing page: `https://stepscribe.vercel.app`
Extension ZIP: `stepscribe.zip` (dist) — also downloadable from the landing.

---

## What it does

- **Record toggle** (`ss:on`): while ON, the content script listens in capture/bubble phase for clicks, inputs and checkbox changes on the page.
- Each step stores: type (`click` / `input` / `toggle`), a deterministic **selector** (`#id`, `[data-sstest=…]`, or `tag.class:nth-of-type(n)`), a label/`value`, sequence number and timestamp.
- **Mini captures**: when the interacted element is `IMG`, `CANVAS` or `VIDEO`, its region is drawn onto a 64×40 canvas with `drawImage` and stored as a `data:image/png` thumbnail. (Honest limit: arbitrary non-drawable elements are recorded by selector + label only — full-page raster would need an extra capture permission; documented, not silently faked.)
- The popup renders the numbered sheet (`S1…Sn`), toggles recording, **exports .md / .html** (thumbnails embedded) via a local Blob, and **clears** the steps.
- Steps persist in `chrome.storage.local` across popup reloads.

## Permissions (all justified, all local)

| Permission | Why |
| --- | --- |
| `storage` | Persist `ss:on`, `ss:steps`, `ss:lang` in `chrome.storage.local`. |

Content scripts run on `http://*/*` and `https://*/*` (no `<all_urls>`) because recording happens on the pages you interact with. All recording, capture and export logic is local. **No network request, no accounts, no telemetry.**

## Install (load unpacked)

1. Download `stepscribe.zip` (from this repo `dist/` or the landing page) and unzip it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.
4. Open a page, start recording from the StepScribe popup, work through your flow, then export.

## Verify

```bash
npm install && npm run probe
```

Hermetic Puppeteer suite (local fixture with button/input/checkbox/canvas/img + local server): baseline without extension, idle-vs-recording behavior, 6 real interactions recorded with correct types/selectors/values and **drawImage mini-captures** (two `data:image/png` thumbs), sequence stamps `S1..S6`, popup list rendering, stop-recording isolation, real Blob-download exports (Markdown with `![capture](data:…)`, HTML with `<img src="data:…">`), clear, frozen-state keyspace (`ss:*` only), i18n in 6 languages, packaging byte-identity and — with `STEPSCRIBE_DEPLOY_URL` set — the deployed landing + ZIP checks.

Privacy: everything lives in `chrome.storage.local`.

---

## ES — Resumen

**StepScribe: hazlo una vez, imprime los pasos.** Graba tus interacciones en una página (clics, valores escritos, alternar casillas) y las convierte en una hoja de instrucciones numerada con mini-capturas reales del elemento (imagen/canvas/vídeo vía `drawImage`; el resto se registra por selector y etiqueta — límite documentado, sin simular). El popup lista los pasos con sello de secuencia, exporta Markdown o HTML autocontenido con las miniaturas y borra la lista. Permiso único justificado: `storage` (content scripts en `http/https`). Todo local, cero red. Instalación: ZIP → `chrome://extensions` → *Load unpacked*.

*Built by [Harley Vásquez](https://www.linkedin.com/in/harleyvasquez/).*