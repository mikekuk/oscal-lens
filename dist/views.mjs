import { same, originalPart, parameterChanged, removedContent } from './provenance.mjs';
import { itemLabel, locateItem } from './mappings.mjs';
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
export function renderFields(value, original, trackChanges = false) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return `<p>${changedText(escapeHtml(value), trackChanges && !same(value, original))}</p>`;
  if (Array.isArray(value)) {
    return value.map((item, index) => `<div class="part">${renderFields(item, item?.id ? original?.find(x => x.id === item.id) : original?.[index], trackChanges)}</div>`).join('');
  }
  const fields = Object.entries(value).map(([key, fieldValue]) => {
    const content = typeof fieldValue === 'object' ? renderFields(fieldValue, original?.[key], trackChanges) : changedText(escapeHtml(fieldValue), trackChanges && !same(fieldValue, original?.[key]));
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
  if (rows.some(row => row.mappings?.length)) options.push(`<label class="section-option"><input type="checkbox" data-section="mappings" ${visibility.mappings !== false ? 'checked' : ''}> Mappings</label>`);
  options.push(
    `<label class="section-option"><input type="checkbox" data-section="parameters" ${visibility.parameters ? 'checked' : ''}> Parameters</label>`
  );
  options.push(
    `<label class="section-option"><input type="checkbox" data-section="metadata" ${visibility.metadata ? 'checked' : ''}> Control metadata</label>`
  );
  return options.join('');
}

// Statement items keep their labels inline, with a line break between items;
// structural OSCAL IDs and property tables stay in the Source view.
function changedText(html, changed, kind = 'content') {
  return changed ? `<span class="profile-change" title="Added or changed by a profile layer (${kind})">${html}</span>` : html;
}
function renderProse(text, parameters, row, changed) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (changed) return changedText(escapeHtml(substituteParameters(input, parameters)), true);
  const pattern = /\{\{\s*insert:\s*param\s*,\s*([^{}]+?)\s*\}\}/g;
  let result = '', offset = 0;
  for (const match of input.matchAll(pattern)) {
    result += changedText(escapeHtml(input.slice(offset, match.index)), changed);
    const value = substituteParameters(match[0], parameters);
    const modified = row?.baseControl && parameterChanged(match[1].trim(), parameters, row.baseParameters);
    result += changedText(escapeHtml(value), changed || modified, 'parameter');
    offset = match.index + match[0].length;
  }
  return result + changedText(escapeHtml(input.slice(offset)), changed);
}
function renderPartFlow(part, parameters, visibility, isSectionRoot = false, row, original) {
  if (visibility[part.name || 'other'] === false) return '';
  const label = part.props?.find(property => property.name === 'label')?.value;
  const oldLabel = original?.props?.find(property => property.name === 'label')?.value;
  const profile = !!row?.baseControl;
  const prose = renderProse(part.prose, parameters, row, profile && part.prose !== original?.prose);
  const title = !isSectionRoot && part.title && !part.prose ? `<strong>${changedText(escapeHtml(part.title), profile && part.title !== original?.title)}</strong> ` : '';
  const prefix = label ? `<strong class="item-label">${changedText(escapeHtml(label), profile && label !== oldLabel)}</strong> ` : '';
  const ownText = prose ? `<span class="statement-item">${prefix}${prose}</span>` : prefix;
  const children = (part.parts || []).map((child, index) => renderPartFlow(child, parameters, visibility, false, row, originalPart(child, original?.parts, index))).filter(Boolean);
  return [title + ownText, ...children].filter(Boolean).join('<br>');
}

function renderParts(parts = [], parameters = {}, visibility = {}, row) {
  return parts.map((part, index) => {
    if (!sectionVisible(part.name || 'other', visibility)) return '';
    const original = originalPart(part, row?.baseControl?.parts, index);
    const title = part.title || (part.name || 'other').replace(/-/g, ' ');
    const changed = !!row?.baseControl && (!original || part.title !== original.title || part.name !== original.name);
    return `<section class="control-section"><h4>${changedText(escapeHtml(title), changed)}</h4><p class="statement-flow">${renderPartFlow(part, parameters, visibility, true, row, original)}</p></section>`;
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
  const status = errorCount ? `${errorCount} validation errors` : issues.some(issue => issue.code === 'schema-unavailable') ? 'Schema not checked' : issues.length ? 'Validation notice' :
    'Schema checks passed';
  return `<div>
    <p class="eyebrow">${type === 'profile' ? 'PROFILE SELECTION PREVIEW' : type === 'mapping-collection' ? 'MAPPING COLLECTION' : 'CATALOGUE'}</p>
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

export function renderValidation(issues, result, problem, type = 'catalog', version) {
  const schemaStatus = issues.some(issue => issue.code === 'schema-unavailable')
    ? 'No matching bundled schema was available; schema validation was not performed. Identifier checks are reported below.'
    : `Checked against bundled NIST OSCAL ${escapeHtml(version)} ${escapeHtml(type)} JSON Schema, with identifier checks.`;
  const report = issues.length ? issues.map(issue => `<div class="issue">
    <span class="badge warn">${escapeHtml(issue.severity)}</span>
    <code>${escapeHtml(issue.path)}</code>${escapeHtml(issue.message)}
  </div>`).join('') : '<p>Schema and identifier checks passed.</p>';
  return `<div class="matter-block">
    <h3>Validation report</h3>
    <p>${schemaStatus} Profile processing is reported separately.</p>
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

function renderControl(row, index, visibility, includeMappings = true) {
  const control = row.control;
  const breadcrumb = [...row.groups.map(group => group.title), ...row.parents].join(' / ') || 'Ungrouped';
  const source = row.source ? ' · ' + escapeHtml(row.source) : '';
  // Show the effective scope so inherited and profile-tailored values agree with inline ODPs.
  const effectiveParameters = Object.values(row.parameters || {}).length
    ? Object.values(row.parameters) : (control.params || []);
  const parameters = visibility.parameters && effectiveParameters.length
    ? `<section class="control-section"><h4>Parameters</h4>${effectiveParameters.map(parameter => renderFields(parameter, row.baseParameters?.[parameter.id], !!row.baseControl)).join('')}</section>` : '';
  const metadata = visibility.metadata ? renderFields(omitFields(control, ['id', 'title', 'parts', 'params',
    'controls'
  ]), row.baseControl, !!row.baseControl) : '';
  return `<details class="control" ${index === 0 ? 'open' : ''}>
    <summary><span class="id">${escapeHtml(control.id)}</span><strong>${changedText(escapeHtml(control.title), !!row.baseControl && control.title !== row.baseControl.title)}</strong>
      <span class="crumb">${escapeHtml(breadcrumb)}${source}</span>
    </summary>
    <div class="detail">${renderParts(control.parts, row.parameters, visibility, row)}${parameters}${metadata}${renderProfileChanges(row)}${includeMappings && visibility.mappings !== false ? renderMappings(row.mappings, visibility) : ''}</div>
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
  return `${previewNotice}${type === 'profile' ? '<p class="profile-legend"><span class="profile-change">Coloured text</span> = added or changed by a profile layer. Other text comes from the catalogue.</p>' : ''}${invalidNotice}${renderProcessingNotes(result, problem)}
    <div class="count"><span>${rows.length} ${rows.length === 1 ? 'control' : 'controls'} shown</span>
      <span>${selectedGroup ? 'Filtered by group' : 'All groups'}</span>
    </div>${controls}`;
}

function renderProfileChanges(row) {
  if (!row.baseControl) return '';
  const removed = removedContent(row.control, row.baseControl);
  return removed.length ? `<details class="profile-removals"><summary>Profile removals (${removed.length})</summary><p>Catalogue content removed by the profile layers:</p>${renderFields(removed)}</details>` : '';
}
function renderMappings(records = [], visibility) {
  if (!records.length) return '';
  return `<section class="control-section mappings"><h4>Mappings (${records.length})</h4>${records.map(record => {
    const {map, mapping, collection, other} = record;
    const otherBody = other.entry && model(other.entry.doc).body;
    const title = otherBody?.metadata?.title || other.entry?.name || other.href || 'Missing resource';
    const targets = record.targets.map(item => itemLabel(item)).join('; ');
    const collective = record.ownItems.length > 1 || record.targets.length > 1;
    return `<details class="mapping"><summary><span class="badge">${escapeHtml(record.relationship || 'Relationship unspecified')}</span><strong>${escapeHtml(title)}</strong><span class="mapping-targets">${escapeHtml(targets)}</span></summary>
      <div class="mapping-detail"><p><strong>This side:</strong> ${escapeHtml(record.ownItems.map(itemLabel).join('; '))}</p>
      ${record.inheritedFrom ? renderNotice('Inherited from ' + documentPath(record.inheritedFrom) + '. This mapping describes the source content; profile tailoring does not reassess the relationship.') : ''}
      <p><strong>Relationship:</strong> ${escapeHtml(record.relationship)}${map.ns ? ' · namespace: ' + escapeHtml(map.ns) : ''}${record.rationale ? ' · ' + escapeHtml(record.rationale) + ' comparison' : ''}</p>
      ${collective ? '<p class="notice">This relationship applies to the complete sets listed on each side, collectively.</p>' : ''}
      <p class="mapping-provenance">${escapeHtml(collection.doc['mapping-collection'].metadata?.title || collection.name)} · ${escapeHtml(documentPath(collection))}${record.status ? ' · ' + escapeHtml(record.status) : ''}${otherBody?.metadata?.version ? ' · Referenced version ' + escapeHtml(otherBody.metadata.version) : ''}</p>
      ${record.description ? '<p>' + escapeHtml(record.description) + '</p>' : ''}
      ${map.remarks ? '<p>' + escapeHtml(map.remarks) + '</p>' : ''}
      ${mapping.remarks ? '<p>' + escapeHtml(mapping.remarks) + '</p>' : ''}
      ${map.qualifiers ? renderFields({qualifiers: map.qualifiers}) : ''}
      ${(other.notes || []).map(note => renderNotice(note)).join('')}
      ${other.issues?.some(issue => issue.severity === 'error') ? renderNotice('The referenced document has validation errors. Its content is shown for inspection.', true) : ''}
      ${other.entry?.doc.profile ? renderNotice('Referenced profile: selection preview with effective tailoring; not a fully resolved catalogue.') : ''}
      ${other.error ? renderNotice(other.error, true) : record.targets.map(item => {
        const matches = locateItem(item, other.rows || []);
        if (!matches.length) return renderNotice('Cannot locate ' + itemLabel(item) + ' in the loaded resource.', true);
        if (matches.length > 1) return renderNotice('Ambiguous ' + itemLabel(item) + ': multiple matches; no control selected.', true);
        return matches.map(({row: targetRow, node}) => `<div class="mapped-item"><h5>${escapeHtml(itemLabel(item))}</h5>
          ${item.type === 'control' ? '' : '<p class="statement-flow">' + renderPartFlow(node, targetRow.parameters, {}, false, targetRow, findOriginalPart(targetRow.baseControl?.parts, node.id)) + '</p>'}
          <p>Full control · ${escapeHtml(targetRow.control.id)}</p>${renderControl(targetRow, 0, visibility, false)}</div>`).join('');
      }).join('')}
      </div></details>`;
  }).join('')}</section>`;
}

function findOriginalPart(parts = [], id) {
  for (const part of parts) {
    if (id && part.id === id) return part;
    const nested = findOriginalPart(part.parts, id);
    if (nested) return nested;
  }
}
