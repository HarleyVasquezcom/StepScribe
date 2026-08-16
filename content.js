'use strict';

const THUMB_W = 64;
const THUMB_H = 40;
const VALUE_MAX = 60;

let recording = false;

function selectorOf(el) {
  if (!el || !el.tagName) return '';
  if (el.id) return '#' + el.id;
  if (el.getAttribute && el.getAttribute('data-sstest')) return '[data-sstest="' + el.getAttribute('data-sstest') + '"]';
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/)[0]
    : '';
  const idx = el.parentElement
    ? Array.from(el.parentElement.children).indexOf(el) + 1
    : 1;
  return tag + cls + ':nth-of-type(' + idx + ')';
}

function miniCapture(el) {
  const drawable = el && (el.tagName === 'IMG' || el.tagName === 'CANVAS' || el.tagName === 'VIDEO');
  if (!drawable) return '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (el.tagName === 'VIDEO') {
      if (!el.videoWidth) return '';
      ctx.drawImage(el, 0, 0, THUMB_W, THUMB_H);
    } else {
      ctx.drawImage(el, 0, 0, THUMB_W, THUMB_H);
    }
    return canvas.toDataURL('image/png');
  } catch (e) {
    return '';
  }
}

function snippet(el) {
  const t = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return t.length > 60 ? t.slice(0, 57) + '…' : t;
}

function readSteps() {
  return new Promise((resolve) => {
    chrome.storage.local.get('ss:steps', (s) => {
      resolve(Array.isArray(s['ss:steps']) ? s['ss:steps'] : []);
    });
  });
}

function writeSteps(steps) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ 'ss:steps': steps }, resolve);
  });
}

let stepQueue = Promise.resolve();

function enqueue(fn) {
  stepQueue = stepQueue.then(fn).catch((e) => console.error('[ss] record error', String(e)));
  return stepQueue;
}

async function record(step) {
  return enqueue(async () => {
    const steps = await readSteps();
    step.id = 'ss' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    step.seq = steps.length ? Math.max(...steps.map((st) => st.seq)) + 1 : 1;
    step.ts = Date.now();
    steps.push(step);
    await writeSteps(steps);
  });
}

document.addEventListener('click', (e) => {
  if (!recording) return;
  const el = e.target && e.target.closest ? e.target.closest('button, a, input, textarea, select, [role=button], [data-sstest]') : null;
  const target = el || e.target;
  if (!target || !target.tagName || target.tagName === 'HTML' || target.tagName === 'BODY') return;
  record({
    type: 'click',
    target: selectorOf(target),
    label: snippet(target),
    thumb: miniCapture(target),
  });
}, true);

document.addEventListener('input', (e) => {
  if (!recording) return;
  const el = e.target;
  if (!el || !el.tagName || !(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
  if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el.type || '').toLowerCase())) return;
  record({
    type: 'input',
    target: selectorOf(el),
    value: String(el.value || '').slice(0, VALUE_MAX),
    thumb: '',
  });
}, true);

document.addEventListener('change', (e) => {
  if (!recording) return;
  const el = e.target;
  if (!el || !el.tagName || !(el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
  if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el.type || '').toLowerCase())) {
    record({
      type: 'toggle',
      target: selectorOf(el),
      value: String(el.checked),
      thumb: '',
    });
  }
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['ss:on']) recording = !!changes['ss:on'].newValue;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ss:getSteps') {
    readSteps().then((steps) => sendResponse({ steps }));
    return true;
  }
  if (msg.type === 'ss:clear') {
    writeSteps([]).then(() => sendResponse({ cleared: true }));
    return true;
  }
});

chrome.storage.local.get(['ss:on'], (s) => {
  recording = !!s['ss:on'];
});