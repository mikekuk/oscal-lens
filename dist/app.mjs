import { createGraphState, mountGraphSettings } from './graph-settings.mjs';
import { buildMappingIndex } from './mappings.mjs';
/** Browser state, event handling and startup. Pure HTML lives in views.mjs. */
import {
  readDocuments, documentPath
} from './imports.mjs';
import {
  model,
  makeValidator,
  preview
} from './engine.mjs';
import {
  exampleCatalog,
  exampleProfile,
  exampleMappedCatalog,
  exampleMapping
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
let loading = false;
// Display preferences last for this session; assessment sections start hidden.
const sectionVisibility = {
  metadata: false,
  parameters: false
};

// A preview depends on the entire workspace, so any workspace change clears this cache.
let previewCache = new WeakMap();
let mappingCache;
const graphState = createGraphState();
let disposeGraph;
function cachedPreview(entry) {
  if (!previewCache.has(entry.doc)) previewCache.set(entry.doc, preview(entry.doc, documents));
  return previewCache.get(entry.doc);
}

function notice(message, isError = false) {
  select('#message').innerHTML = renderNotice(message, isError);
}

function renderWorkspace() {
  disposeGraph?.();
  disposeGraph = undefined;
  select('#doc-count').textContent = documents.length + ' files';
  select('#documents').innerHTML = renderDocuments(documents, currentDocumentIndex, loading);
  if (!documents.length) {
    for (const selector of ['#heading', '#issue-count', '#groups', '#section-options']) {
      select(selector).innerHTML = '';
    }
    select('#panel').innerHTML = renderNotice('No files loaded. Open files or a folder, or load the example workspace.');
    return;
  }
  // Only the active tab belongs in the keyboard's normal tab order.
  document.querySelectorAll('[role=tab]').forEach(button => {
    button.setAttribute('aria-selected', button.dataset.tab === tab);
    button.tabIndex = button.dataset.tab === tab ? 0 : -1;
  });

  if (tab === 'graph') {
    select('#heading').innerHTML = '<h2>Mapping network</h2>';
    for (const selector of ['#issue-count', '#groups', '#section-options']) select(selector).innerHTML = '';
    disposeGraph = mountGraphSettings(select('#panel'), documents, cachedPreview, validate, graphState);
    return;
  }
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

  mappingCache ||= buildMappingIndex(documents, cachedPreview, validate);
  result = { ...result, rows: result.rows.map(row => ({ ...row,
    mappings: mappingCache.index.get(entry.doc)?.get(row.control) || []
  })), notes: [...new Set([...result.notes, ...(mappingCache.notices.get(entry.doc) || [])])] };
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  select('#heading').innerHTML = renderHeading(entry, type, body, result, issues);
  select('#issue-count').textContent = issues.length ? `(${issues.length})` : '';
  select('#groups').innerHTML = renderGroups(type === 'catalog' ? [body] : result.sources, result, group);

  select('#section-options').innerHTML = renderSectionOptions(result.rows, sectionVisibility);

  const panel = select('#panel');
  if (tab === 'validation') {
    panel.innerHTML = renderValidation(issues, result, problem, type, body.metadata?.['oscal-version']);
  } else if (tab === 'source') {
    panel.innerHTML = renderSource(entry.doc);
  } else if (tab === 'matter') {
    const roots = type === 'catalog' ? [body] : [body, ...result.sources];
    panel.innerHTML = renderGreyMatter(roots, group, problem);
  } else if (type === 'mapping-collection') {
    panel.innerHTML = renderNotice('Mappings are added automatically when you select a referenced catalogue or profile.') + result.notes.map(note => renderNotice(note, true)).join('') + renderSource(entry.doc);
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
  mappingCache = undefined;
  documents = [{
    name: 'example-profile.json',
    doc: structuredClone(exampleProfile)
  }, {
    name: 'example-catalog.json',
    doc: structuredClone(exampleCatalog)
  }, {name: 'example-assurance.json', doc: structuredClone(exampleMappedCatalog)},
  {name: 'example-mapping.json', doc: structuredClone(exampleMapping)}];
  currentDocumentIndex = 0;
  group = '';
  select('#search').value = '';
  notice('Example workspace loaded. These documents are illustrative, not an official baseline.');
  render()
}
function removeDocument(index) {
  // A pending upload holds a snapshot of the workspace: do not let it restore a removed file.
  if (loading || !Number.isInteger(index) || !documents[index]) return;
  const selected = documents[currentDocumentIndex];
  const [removed] = documents.splice(index, 1);
  const retainedIndex = documents.indexOf(selected);
  currentDocumentIndex = retainedIndex >= 0 ? retainedIndex : Math.min(index, Math.max(0, documents.length - 1));
  previewCache = new WeakMap();
  mappingCache = undefined;
  group = '';
  if (removed === selected) select('#search').value = '';
  notice(`Removed ${documentPath(removed)} from the workspace. Your original file is unchanged.`);
  render();
  // The focused cross was replaced by rendering; keep keyboard navigation in the file list.
  const buttons = [...select('#documents').querySelectorAll('[data-remove-doc]')];
  (buttons[Math.min(index, buttons.length - 1)] || select('#files')).focus();
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
  const remove = event.target.closest('[data-remove-doc]');
  if (remove) {
    removeDocument(Number(remove.dataset.removeDoc));
    return;
  }
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
  if (!files.length || loading) return;
  loading = true;
  select('#documents').innerHTML = renderDocuments(documents, currentDocumentIndex, loading);
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
    mappingCache = undefined;
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
    loading = false;
    select('#documents').innerHTML = renderDocuments(documents, currentDocumentIndex, loading);
    input.value = '';
    select('#files').disabled = false;
    select('#folder').disabled = false;
    select('#demo').disabled = false;
  }
}
select('#files').onchange = event => openDocuments(event);
select('#folder').onchange = event => openDocuments(event, true);

// Load same-origin, pinned schemas; compilation and results are cached on demand.
try {
  const response = await fetch('schemas/manifest.json');
  if (!response.ok) throw Error('Cannot load bundled schema manifest.');
  const manifest = await response.json();
  const schemas = Object.fromEntries(await Promise.all(manifest.map(async ({type, version, path}) => {
    const r = await fetch(path);
    if (!r.ok) throw Error(`Cannot load bundled OSCAL ${version} ${type} schema.`);
    return [`${type}@${version}`, await r.json()];
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
