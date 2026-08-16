'use strict';

const i18n = window.StepScribeI18N;
const $ = (id) => document.getElementById(id);

let steps = [];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

async function sendTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return null;
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    return null;
  }
}

function flash(text) {
  $('statusMsg').textContent = text;
}

const TYPE_KEY = { click: 'typeClick', input: 'typeInput', toggle: 'typeToggle' };

function render() {
  const list = $('stepList');
  $('seqVal').textContent = String(steps.length);
  list.innerHTML = '';
  if (!steps.length) {
    const div = document.createElement('div');
    div.className = 'empty';
    div.textContent = i18n.t('noSteps', i18n.current);
    list.appendChild(div);
    return;
  }
  for (const step of steps) {
    const li = document.createElement('li');
    li.className = 'step';
    li.dataset.seq = String(step.seq);
    const row = document.createElement('div');
    row.className = 'steprow';
    const seq = document.createElement('span');
    seq.className = 'seq';
    seq.textContent = 'S' + step.seq;
    const type = document.createElement('span');
    type.className = 'type';
    type.textContent = i18n.t(TYPE_KEY[step.type] || 'typeClick', i18n.current);
    const target = document.createElement('span');
    target.className = 'target';
    target.textContent = (step.type === 'click' ? step.target : i18n.t('inField', i18n.current) + ' ' + step.target) +
      (step.label ? ' — ' + step.label : '');
    row.append(seq, type, target);
    if (step.thumb) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.src = step.thumb;
      img.alt = '';
      row.appendChild(img);
    }
    li.appendChild(row);
    if (step.value !== undefined && step.type !== 'click') {
      const v = document.createElement('div');
      v.className = 'value';
      v.textContent = i18n.t('withValue', i18n.current) + ' "' + (step.value || '') + '"';
      li.appendChild(v);
    }
    list.appendChild(li);
  }
}

function mdOf() {
  const lines = ['# StepScribe — recorded steps', '', '_Generated locally by StepScribe._', ''];
  for (const step of steps) {
    const qual =
      step.type === 'click' ? `click ${step.target}${step.label ? ' (' + step.label + ')' : ''}`
      : step.type === 'toggle' ? `toggle ${step.target} → ${step.value || '?'}`
      : `type in ${step.target}: ${step.value || ''}`;
    let line = `${step.seq}. ${qual}`;
    if (step.thumb) line += `\n   ![capture](${step.thumb})`;
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}

function htmlOf() {
  const body = steps.map((step) => {
    const qual =
      step.type === 'click' ? `click <code>${esc(step.target)}</code>${step.label ? ` (${esc(step.label)})` : ''}`
      : step.type === 'toggle' ? `toggle <code>${esc(step.target)}</code> → <b>${esc(step.value || '?')}</b>`
      : `type in <code>${esc(step.target)}</code>: <b>"${esc(step.value || '')}"</b>`;
    return `<li>${qual}${step.thumb ? `<br><img src="${step.thumb}" alt="capture" width="128">` : ''}</li>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>StepScribe export</title>` +
    `<style>body{font-family:Georgia,serif;max-width:640px;margin:2rem auto;line-height:1.7}code{background:#eef1f7;padding:1px 5px}img{border:1px solid #c7d3ea}</style></head>` +
    `<body><h1>StepScribe — recorded steps</h1><p><em>Generated locally by StepScribe.</em></p><ol>${body}</ol></body></html>`;
}

function download(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

$('toggleBtn').addEventListener('click', async () => {
  const s = await chrome.storage.local.get('ss:on');
  await chrome.storage.local.set({ 'ss:on': !s['ss:on'] });
});

$('clearBtn').addEventListener('click', async () => {
  const r = await sendTab({ type: 'ss:clear' });
  if (r && r.cleared) {
    await refresh();
    flash(i18n.t('clearOk', i18n.current));
  }
});

$('exportMdBtn').addEventListener('click', () => {
  if (!steps.length) return;
  download('stepscribe-' + Date.now() + '.md', 'text/markdown', mdOf());
  flash(i18n.t('exportOk', i18n.current));
});

$('exportHtmlBtn').addEventListener('click', () => {
  if (!steps.length) return;
  download('stepscribe-' + Date.now() + '.html', 'text/html', htmlOf());
  flash(i18n.t('exportOk', i18n.current));
});

async function refresh() {
  const res = await sendTab({ type: 'ss:getSteps' });
  steps = res && res.steps ? res.steps : [];
  render();
}

async function init() {
  const lang = await i18n.getLang();
  i18n.current = lang;
  $('langSel').value = lang;
  i18n.apply(document);
  await refresh();
  const s = await chrome.storage.local.get('ss:on');
  syncLed(!!s['ss:on']);
}

function syncLed(on) {
  const led = $('stateLed');
  led.classList.toggle('stamp-rec', on);
  led.textContent = i18n.t(on ? 'statusOn' : 'statusOff', i18n.current);
}

$('langSel').addEventListener('change', async (e) => {
  const lang = await i18n.setLang(e.target.value);
  i18n.current = lang;
  i18n.apply(document);
  render();
  const s = await chrome.storage.local.get('ss:on');
  syncLed(!!s['ss:on']);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['ss:on']) syncLed(!!changes['ss:on'].newValue);
  if (changes['ss:steps']) refresh();
});

init();