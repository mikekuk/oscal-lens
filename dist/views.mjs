import {
  substituteParameters
} from './parameters.mjs';
/** Pure HTML renderers. Application state and event handlers live in app.mjs. */
import {
  model
} from './engine.mjs';
import {
  documentPath
} from './imports.mjs';

// OSCAL prose can contain markup. Always display supplied content as text rather
// than allowing it to become executable HTML in an innerHTML assignment.
export function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

function omitFields(object, excluded) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !excluded.includes(key)));
}

// Keep unknown extension fields visible instead of limiting the view to a fixed
// set of metadata properties. Nested OSCAL assemblies become nested field lists.
export function renderFields(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return `<p>${escapeHtml(value)}</p>`;
  if (Array.isArray(value)) {
    return value.map(item => `<div class="part">${renderFields(item)}</div>`).join('');
  }
  const fields = Object.entries(value).map(([key, fieldValue]) => {
    const content = typeof fieldValue === 'object' ? renderFields(fieldValue) : escapeHtml(fieldValue);
    return `<div class="kv"><dt>${escapeHtml(key)}</dt><dd>${content}</dd></div>`;
  });
  return `<dl>${fields.join('')}</dl>`;
}

// Visibility is keyed by part name so the same section setting applies across controls.
export function sectionVisible(name, visibility = {}) {
  return visibility[name] ?? !/assessment|objective/i.test(name);
}

export function controlSections(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const part of row.control.parts || []) names.add(part.name || 'other');
  }
  return [...names];
}

export function renderSectionOptions(rows, visibility) {
  const names = controlSections(rows);
  const options = names.map(name => {
    const label = name.replace(/-/g, ' ');
    return `<label class="section-option"><input type="checkbox" data-section="${escapeHtml(name)}" ${sectionVisible(name, visibility) ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
  });
  options.push(
    `<label class="section-option"><input type="checkbox" data-section="metadata" ${visibility.metadata ? 'checked' : ''}> Control metadata</label>`
    );
  return options.join('');
}

// A statement is one continuous reading flow. Item labels are printed inline;
// structural OSCAL IDs and property tables stay in the Source view.
function renderPartFlow(part, parameters, visibility) {
  // Nested items inherit the containing section unless explicitly hidden.
  if (visibility[part.name || 'other'] === false) return '';
  const label = part.props?.find(property => property.name === 'label')?.value;
  const prose = substituteParameters(part.prose, parameters).replace(/\s+/g, ' ').trim();
  const prefix = label ? `<strong class="item-label">${escapeHtml(label)}</strong> ` : '';
  const ownText = prose ? `<span class="statement-item">${prefix}${escapeHtml(prose)}</span>` : prefix;
  const children = (part.parts || []).map(child => renderPartFlow(child, parameters, visibility)).filter(
    Boolean);
  return [ownText, ...children].filter(Boolean).join(' ');
}

function renderParts(parts = [], parameters = {}, visibility = {}) {
  return parts.filter(part => sectionVisible(part.name || 'other', visibility)).map(part => {
    const title = part.title || (part.name || 'other').replace(/-/g, ' ');
    return `<section class="control-section"><h4>${escapeHtml(title)}</h4><p class="statement-flow">${renderPartFlow(part, parameters, visibility)}</p></section>`;
  }).join('');
}

export function allGroups(root) {
  return (root.groups || []).flatMap(group => [group, ...allGroups(group)]);
}

export function renderNotice(message, isError = false) {
  return message ? `<div class="notice ${isError ? 'error' : ''}">${escapeHtml(message)}</div>` : '';
}

function renderProcessingNotes(result, problem) {
  return renderNotice(problem, true) + result.notes.map(note => renderNotice(note)).join('');
}

export function renderDocuments(documents, currentIndex) {
  return documents.map((entry, index) => {
    const {
      type,
      body
    } = model(entry.doc);
    return `<button class="doc ${index === currentIndex ? 'active' : ''}" data-doc="${index}">
      ${escapeHtml(body.metadata?.title || entry.name)}
      <small>${escapeHtml(type)} · ${escapeHtml(documentPath(entry))}</small>
    </button>`;
  }).join('');
}

export function renderHeading(entry, type, body, result, issues) {
  const groupCount = new Set(result.rows.flatMap(row => row.groups.map(group => group.id || group.title)))
    .size;
  const errorCount = issues.filter(issue => issue.severity === 'error').length;
  const status = errorCount ? `${errorCount} validation errors` : issues.length ? 'Version notice' :
    'Schema checks passed';
  return `<div>
    <p class="eyebrow">${type === 'profile' ? 'PROFILE SELECTION PREVIEW' : 'CATALOGUE'}</p>
    <h2>${escapeHtml(body.metadata?.title || entry.name)}</h2>
    <p>${result.rows.length} controls · ${groupCount} groups · OSCAL ${escapeHtml(body.metadata?.['oscal-version'] || 'unknown')}</p>
  </div><span class="badge ${issues.length ? 'warn' : ''}">${status}</span>`;
}

export function renderGroups(sources, result, selectedGroup) {
  const groups = new Map();
  for (const source of sources) {
    for (const group of allGroups(source)) groups.set(group.id || group.title, group);
  }
  return [...groups].map(([id, group]) => {
    const count = result.rows.filter(row => row.groups.some(parent => (parent.id || parent.title) === id))
      .length;
    return `<button class="group ${selectedGroup === id ? 'active' : ''}" data-group="${escapeHtml(id)}">
      ${escapeHtml(group.title || id)} <small>(${count})</small>
    </button>`;
  }).join('') || '<p class="side-foot">No source groups</p>';
}

export function renderValidation(issues, result, problem) {
  const report = issues.length ? issues.map(issue => `<div class="issue">
    <span class="badge warn">${escapeHtml(issue.severity)}</span>
    <code>${escapeHtml(issue.path)}</code>${escapeHtml(issue.message)}
  </div>`).join('') : '<p>Schema and identifier checks passed.</p>';
  return `<div class="matter-block">
    <h3>Validation report</h3>
    <p>Checked against bundled NIST OSCAL 1.0.4 JSON Schema, with identifier checks. Profile processing is reported separately.</p>
    ${report}
  </div>${renderProcessingNotes(result, problem)}`;
}

export function renderSource(document) {
  // Keep JSON whitespace inside pre intact when changing surrounding markup.
  return `<pre>${escapeHtml(JSON.stringify(document, null, 2))}</pre>`;
}

export function renderGreyMatter(roots, selectedGroup, problem) {
  function section(title, node) {
    // Controls have their own view; all other group/document fields are context.
    return `<section class="matter-block"><h3>${escapeHtml(title)}</h3>${renderFields(omitFields(node, ['controls', 'groups']))}</section>`;
  }
  const content = roots.map(root => {
    const groups = allGroups(root).filter(group => !selectedGroup || (group.id || group.title) ===
      selectedGroup);
    return section(root.metadata?.title || 'Document', root) + groups.map(group => section(group.title ||
      group.id, group)).join('');
  }).join('');
  return `<div class="count">Grey matter · metadata, guidance, parameters and supporting resources</div>${renderNotice(problem, true)}${content}`;
}

function renderControl(row, index, visibility) {
  const control = row.control;
  const breadcrumb = [...row.groups.map(group => group.title), ...row.parents].join(' / ') || 'Ungrouped';
  const source = row.source ? ' · ' + escapeHtml(row.source) : '';
  const metadata = visibility.metadata ? renderFields(omitFields(control, ['id', 'title', 'parts', 'params',
    'controls'
  ])) : '';
  return `<details class="control" ${index === 0 ? 'open' : ''}>
    <summary><span class="id">${escapeHtml(control.id)}</span><strong>${escapeHtml(control.title)}</strong>
      <span class="crumb">${escapeHtml(breadcrumb)}${source}</span>
    </summary>
    <div class="detail">${renderParts(control.parts, row.parameters, visibility)}${metadata}</div>
  </details>`;
}

export function renderControls(type, result, problem, errorCount, selectedGroup, query, visibility = {}) {
  const rows = result.rows.filter(row => {
    const inGroup = !selectedGroup || row.groups.some(group => (group.id || group.title) ===
      selectedGroup);
    return inGroup && substituteParameters(JSON.stringify(row.control), row.parameters).toLowerCase()
      .includes(query);
  });
  const previewNotice = type === 'profile' ? renderNotice(
    'Selection preview: selected controls and effective parameter values are shown within source groups. This is not a fully resolved OSCAL catalogue.'
    ) : '';
  const invalidNotice = errorCount ? renderNotice(
    'This document has validation errors. Displayed content is for inspection only.', true) : '';
  const emptyMessage = problem ? 'Load the missing source files to see the profile’s controls.' :
    'No controls match this view.';
  const controls = rows.length ? rows.map((row, index) => renderControl(row, index, visibility)).join('') :
    `<div class="empty">${emptyMessage}</div>`;
  return `${previewNotice}${invalidNotice}${renderProcessingNotes(result, problem)}
    <div class="count"><span>${rows.length} ${rows.length === 1 ? 'control' : 'controls'} shown</span>
      <span>${selectedGroup ? 'Filtered by group' : 'All groups'}</span>
    </div>${controls}`;
}
