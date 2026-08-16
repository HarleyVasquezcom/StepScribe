'use strict';

const LANGUAGES = ['en', 'es', 'fr', 'pt', 'it', 'de'];

const I18N = {
  en: {
    appTitle: 'StepScribe', tagline: 'do it once, print the steps', credit: 'Built by Harley Vásquez',
    statusOn: 'REC', statusOff: 'IDLE', toggle: '[ start / stop recording ]',
    stepsTitle: 'recorded steps', noSteps: '~ nothing recorded yet — press start',
    exportMd: 'export .md', exportHtml: 'export .html', clearBtn: '[ clear steps ]',
    clearOk: 'ok: steps cleared', typeClick: 'CLICK', typeInput: 'TYPE', typeToggle: 'TOGGLE',
    inField: 'in', withValue: 'with value', exportOk: 'ok: exported', hint: 'steps are written per interaction; img/canvas targets get a mini capture',
  },
  es: {
    appTitle: 'StepScribe', tagline: 'hazlo una vez, imprime los pasos', credit: 'Creado por Harley Vásquez',
    statusOn: 'REC', statusOff: 'EN ESPERA', toggle: '[ iniciar / detener grabación ]',
    stepsTitle: 'pasos registrados', noSteps: '~ aún no hay nada — pulsa iniciar',
    exportMd: 'exportar .md', exportHtml: 'exportar .html', clearBtn: '[ borrar pasos ]',
    clearOk: 'ok: pasos borrados', typeClick: 'CLIC', typeInput: 'TECLEO', typeToggle: 'ALTERNA',
    inField: 'en', withValue: 'con valor', exportOk: 'ok: exportado', hint: 'los pasos se escriben por interacción; los objetivos img/canvas llevan mini-captura',
  },
  fr: {
    appTitle: 'StepScribe', tagline: 'faites-le une fois, imprimez les étapes', credit: 'Créé par Harley Vásquez',
    statusOn: 'REC', statusOff: 'REPOS', toggle: '[ démarrer / arrêter l\u2019enregistrement ]',
    stepsTitle: 'étapes enregistrées', noSteps: '~ rien pour l\u2019instant — démarrez',
    exportMd: 'exporter .md', exportHtml: 'exporter .html', clearBtn: '[ effacer les étapes ]',
    clearOk: 'ok : étapes effacées', typeClick: 'CLIC', typeInput: 'SAISIE', typeToggle: 'BASCULE',
    inField: 'dans', withValue: 'avec la valeur', exportOk: 'ok : exporté', hint: 'les étapes sont écrites à chaque interaction ; les cibles img/canvas reçoivent une mini-capture',
  },
  pt: {
    appTitle: 'StepScribe', tagline: 'faça uma vez, imprima os passos', credit: 'Criado por Harley Vásquez',
    statusOn: 'REC', statusOff: 'ESPERA', toggle: '[ iniciar / parar gravação ]',
    stepsTitle: 'passos registrados', noSteps: '~ ainda não há nada — inicie',
    exportMd: 'exportar .md', exportHtml: 'exportar .html', clearBtn: '[ limpar passos ]',
    clearOk: 'ok: passos limpos', typeClick: 'CLIQUE', typeInput: 'DIGITAÇÃO', typeToggle: 'ALTERNAR',
    inField: 'em', withValue: 'com valor', exportOk: 'ok: exportado', hint: 'os passos são escritos por interação; alvos img/canvas ganham mini-captura',
  },
  it: {
    appTitle: 'StepScribe', tagline: 'fallo una volta, stampa i passi', credit: 'Creato da Harley Vásquez',
    statusOn: 'REC', statusOff: 'FERMO', toggle: '[ avvia / ferma registrazione ]',
    stepsTitle: 'passi registrati', noSteps: '~ nessun passo — avvia',
    exportMd: 'esporta .md', exportHtml: 'esporta .html', clearBtn: '[ cancella i passi ]',
    clearOk: 'ok: passi cancellati', typeClick: 'CLIC', typeInput: 'DIGITAZIONE', typeToggle: 'ALTERNA',
    inField: 'in', withValue: 'con valore', exportOk: 'ok: esportato', hint: 'i passi sono scritti per interazione; i bersagli img/canvas ricevono una mini-cattura',
  },
  de: {
    appTitle: 'StepScribe', tagline: 'einmal ausführen, Schritte drucken', credit: 'Erstellt von Harley Vásquez',
    statusOn: 'REC', statusOff: 'BEREIT', toggle: '[ Aufnahme starten / stoppen ]',
    stepsTitle: 'aufgezeichnete Schritte', noSteps: '~ noch nichts aufgezeichnet — starten',
    exportMd: '.md exportieren', exportHtml: '.html exportieren', clearBtn: '[ Schritte löschen ]',
    clearOk: 'ok: Schritte gelöscht', typeClick: 'KLICK', typeInput: 'EINGABE', typeToggle: 'UMSCHALT',
    inField: 'in', withValue: 'mit Wert', exportOk: 'ok: exportiert', hint: 'Schritte werden pro Interaktion geschrieben; img/canvas-Ziele erhalten eine Mini-Aufnahme',
  },
};

const apply = (root) => {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (I18N[current][key] !== undefined) el.textContent = I18N[current][key];
  });
};

const getLang = () =>
  chrome.storage.local.get('ss:lang').then(({ 'ss:lang': lang }) => (LANGUAGES.includes(lang) ? lang : detect()));
const setLang = (lang) => chrome.storage.local.set({ 'ss:lang': lang }).then(() => (LANGUAGES.includes(lang) ? lang : 'en'));
const detect = () => {
  const nav = (navigator.language || 'en').toLowerCase().split('-')[0];
  return LANGUAGES.includes(nav) ? nav : 'en';
};

let current = 'en';

window.StepScribeI18N = {
  apply, getLang, setLang,
  t: (key, lang) => (I18N[lang] || I18N.en)[key] !== undefined ? (I18N[lang] || I18N.en)[key] : key,
  get current() { return current; },
  set current(l) { current = l; },
};