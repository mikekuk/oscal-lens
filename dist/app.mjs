/** Browser state, event handling and startup. Pure HTML lives in views.mjs. */
import {
  readDocuments
} from './imports.mjs';
import {
  model,
  makeValidator,
  preview
} from './engine.mjs';
import {
  exampleCatalog,
  exampleProfile
} from './examples.mjs';
import {
  escapeHtml,
  renderNotice,
  renderDocuments,
  renderHeading,
  renderGroups,
  renderValidation,
  renderSource,
  renderGreyMatter,
  renderControls,
  renderSectionOptions
} from './views.mjs';

const select = selector => document.querySelector(selector);
let documents = [];
let currentDocumentIndex = 0;
let tab = 'controls';
let group = '';
let validate;
// Display preferences last for this session; assessment sections start hidden.
const sectionVisibility = {
  metadata: false,
  parameters: false
};

// A preview depends on the entire workspace, so any file load clears this cache.
let previewCache = new WeakMap();

function notice(message, isError = false) {
  select('#message').innerHTML = renderNotice(message, isError);
}

function renderWorkspace() {
  if (!documents.length) return;
  const entry = documents[currentDocumentIndex];
  const {
    type,
    body
  } = model(entry.doc);
  const issues = validate(entry.doc);
  let result;
  let problem;

  // Missing imports must not hide the original document or its validation report.
  try {
    result = previewCache.get(entry.doc);
    if (!result) {
      result = preview(entry.doc, documents);
      previewCache.set(entry.doc, result);
    }
  } catch (error) {
    problem = error.message;
    result = {
      rows: [],
      sources: [],
      notes: []
    };
  }

  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  select('#doc-count').textContent = documents.length + ' files';
  select('#documents').innerHTML = renderDocuments(documents, currentDocumentIndex);
  select('#heading').innerHTML = renderHeading(entry, type, body, result, issues);
  select('#issue-count').textContent = issues.length ? `(${issues.length})` : '';
  select('#groups').innerHTML = renderGroups(type === 'catalog' ? [body] : result.sources, result, group);

  select('#section-options').innerHTML = renderSectionOptions(result.rows, sectionVisibility);

  // Only the active tab belongs in the keyboard's normal tab order.
  document.querySelectorAll('[role=tab]').forEach(button => {
    button.setAttribute('aria-selected', button.dataset.tab === tab);
    button.tabIndex = button.dataset.tab === tab ? 0 : -1;
  });

  const panel = select('#panel');
  if (tab === 'validation') {
    panel.innerHTML = renderValidation(issues, result, problem);
  } else if (tab === 'source') {
    panel.innerHTML = renderSource(entry.doc);
  } else if (tab === 'matter') {
    const roots = type === 'catalog' ? [body] : [body, ...result.sources];
    panel.innerHTML = renderGreyMatter(roots, group, problem);
  } else {
    const query = select('#search').value.trim().toLowerCase();
    panel.innerHTML = renderControls(type, result, problem, errorCount, group, query, sectionVisibility);
  }
}

function render() {
  try {
    renderWorkspace();
  } catch (error) {
    // Structurally invalid input is still inspectable as escaped source JSON.
    notice('This document cannot be displayed: ' + error.message +
      '. Inspect its validation report or source.', true);
    const entry = documents[currentDocumentIndex];
    if (entry) {
      const issues = validate(entry.doc);
      const messages = issues.map(issue => '<p>' + escapeHtml(issue.path) + ' ' + escapeHtml(issue.message) +
        '</p>').join('');
      select('#panel').innerHTML = '<section class="matter-block"><h3>Invalid document structure</h3>' +
        messages + '</section>' + renderSource(entry.doc);
    }
  }
}

function loadDemo() {
  previewCache = new WeakMap();
  documents = [{
    name: 'example-profile.json',
    doc: structuredClone(exampleProfile)
  }, {
    name: 'example-catalog.json',
    doc: structuredClone(exampleCatalog)
  }];
  currentDocumentIndex = 0;
  group = '';
  select('#search').value = '';
  notice('Example workspace loaded. These documents are illustrative, not an official baseline.');
  render()
}
// Event delegation survives re-rendering the document and group buttons.
select('#section-options').onchange = event => {
  const input = event.target.closest('[data-section]');
  if (!input) return;
  sectionVisibility[input.dataset.section] = input.checked;
  render();
  // Re-rendering replaces checkbox nodes: return keyboard focus to this setting.
  const replacement = [...select('#section-options').querySelectorAll('input')].find(option => option
    .dataset.section === input.dataset.section);
  replacement?.focus();
};
select('#demo').onclick = loadDemo;
select('#all-groups').onclick = () => {
  group = '';
  render()
};
select('#search').oninput = render;
select('#documents').onclick = event => {
  const button = event.target.closest('[data-doc]');
  if (button) {
    currentDocumentIndex = Number(button.dataset.doc);
    group = '';
    render()
  }
};
select('#groups').onclick = event => {
  const button = event.target.closest('[data-group]');
  if (button) {
    group = button.dataset.group;
    render()
  }
};
select('.tabs').onclick = event => {
  const button = event.target.closest('[data-tab]');
  if (button) {
    tab = button.dataset.tab;
    render()
  }
};
select('.tabs').onkeydown = event => {
  const tabButtons = [...document.querySelectorAll('[role=tab]')];
  let i = tabButtons.indexOf(document.activeElement);
  if (i < 0) return;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    i = event.key === 'Home' ? 0 : event.key === 'End' ? tabButtons.length - 1 : (i + (event.key ===
      'ArrowRight' ?
      1 : -1) + tabButtons.length) % tabButtons.length;
    tab = tabButtons[i].dataset.tab;
    render();
    tabButtons[i].focus()
  }
};
// Loading replaces entries by path and preserves browser-local document privacy.
async function openDocuments(event, folder = false) {
  const input = event.target,
    files = [...input.files];
  if (!files.length) return;
  select('#files').disabled = true;
  select('#folder').disabled = true;
  select('#demo').disabled = true;
  notice('Reading local documents…');
  try {
    const previous = documents[currentDocumentIndex]?.doc;
    const result = await readDocuments(files, documents, {
      folder
    });
    documents = result.documents;
    previewCache = new WeakMap();
    const existing = documents.findIndex(d => d.doc === previous);
    const firstProfile = documents.findIndex(d => model(d.doc).type === 'profile' && !d.name
      .startsWith('example-'));
    currentDocumentIndex = firstProfile >= 0 ? firstProfile : existing >= 0 ? existing : Math.max(0,
      documents
      .length - 1);
    group = '';
    select('#search').value = '';
    notice([`${result.added} OSCAL file(s) loaded.`, result.skipped ?
      `${result.skipped} other file(s) skipped.` : '', ...result.errors.slice(0, 5), result
      .errors.length > 5 ? `${result.errors.length-5} more file errors.` : ''
    ].filter(Boolean).join(' '), result.errors.length > 0);
    render();
  } finally {
    input.value = '';
    select('#files').disabled = false;
    select('#folder').disabled = false;
    select('#demo').disabled = false;
  }
}
select('#files').onchange = event => openDocuments(event);
select('#folder').onchange = event => openDocuments(event, true);

// Compile bundled schemas once; individual validation results follow document identity.
try {
  const schemas = Object.fromEntries(await Promise.all(['catalog', 'profile'].map(async k => {
    const r = await fetch(`oscal_${k}_schema.json`);
    if (!r.ok) throw Error('Cannot load bundled schema.');
    return [k, await r.json()]
  })));
  const check = makeValidator(window.ajv7, schemas),
    cache = new WeakMap();
  validate = doc => {
    if (!cache.has(doc)) cache.set(doc, check(doc));
    return cache.get(doc)
  };
  loadDemo()
} catch (event) {
  notice('Could not start validation: ' + event.message, true);
  select('#files').disabled = true;
  select('#folder').disabled = true;
  select('#demo').disabled = true
}
