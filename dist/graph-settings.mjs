import { model } from './engine.mjs';
import { documentPath } from './imports.mjs';
import { buildMappingIndex } from './mappings.mjs';
import { escapeHtml as esc } from './views.mjs';

const palette = ['#7dd3fc', '#fbbf24', '#c4b5fd', '#fb7185', '#6ee7b7', '#fdba74', '#e879f9', '#a3e635'];
export function createGraphState() {
  return {selectedResources: new Set(), hiddenFiles: new Set(), hiddenRelationships: new Set(['no-relationship']),
    expanded: new Set(), positions: new Map(), mode: 'all', colours: new Map()};
}

/** Only selected resources (and catalogue origins needed for inherited profile
 * mappings) are previewed. Unselected catalogues never enter graph construction. */
export function prepareGraph(documents, getPreview, validate, selection) {
  const selected = documents.filter(entry => selection.resources.has(documentPath(entry)) &&
    ['catalog', 'profile'].includes(model(entry.doc).type));
  const needed = new Set(selected.map(entry => entry.doc));
  for (const entry of selected.filter(entry => entry.doc.profile)) {
    try {
      for (const row of getPreview(entry).rows) for (const origin of row.lineage || []) needed.add(origin.doc);
    } catch { /* The graph displays the profile's resolution error. */ }
  }
  const indexedDocuments = documents.filter(entry => !entry.doc['mapping-collection'] || selection.files.has(documentPath(entry)));
  const index = buildMappingIndex(indexedDocuments, getPreview, validate, {
    includeResource: entry => needed.has(entry.doc),
    includeMap: map => selection.relationships.has(map.relationship || 'unspecified')
  });
  return {documents: [...selected, ...indexedDocuments.filter(entry => entry.doc['mapping-collection'])], index};
}

/** This lightweight form does not import Cytoscape, resolve controls, construct
 * graph data or run a layout. Changes remain drafts until the user presses OK. */
export function mountGraphSettings(panel, documents, getPreview, validate, state,
  loadRenderer = () => import('./graph-view.mjs')) {
  const resources = documents.filter(entry => ['catalog', 'profile'].includes(model(entry.doc).type))
    .map(entry => ({id: documentPath(entry), title: model(entry.doc).body.metadata?.title || entry.name, type: model(entry.doc).type}));
  const files = documents.filter(entry => entry.doc['mapping-collection']).map(documentPath);
  const relationships = [...new Set(documents.flatMap(entry => (entry.doc['mapping-collection']?.mappings || [])
    .flatMap(mapping => (mapping.maps || []).map(map => map.relationship || 'unspecified'))))].sort();
  for (const resource of resources) if (!state.colours.has(resource.id)) {
    const i = state.colours.size;
    state.colours.set(resource.id, palette[i] || `hsl(${(i * 137.508) % 360}, 70%, 70%)`);
  }
  const options = (items, kind, checked, label = item => item) => items.map((item, i) => {
    const id = item.id || item;
    return `<label><input type="checkbox" data-filter="${kind}" data-index="${i}" ${checked(id) ? 'checked' : ''}>
      ${kind === 'resources' ? `<span class="graph-swatch" style="background:${state.colours.get(id)}"></span>` : ''}${esc(label(item))}</label>`;
  }).join('');
  panel.innerHTML = `<section class="graph-settings">
    <p>Select catalogues or profiles, mapping files and relationships, then press <strong>OK</strong> to build the graph. These filters are independent of the control sidebar.</p>
    <div class="graph-filters">
      <details open><summary>Catalogues / profiles</summary>${options(resources, 'resources', id => state.selectedResources.has(id), r => `${r.title} (${r.type})`)}</details>
      <details><summary>Mapping files</summary>${options(files, 'files', id => !state.hiddenFiles.has(id)) || '<p>No mapping files loaded.</p>'}</details>
      <details><summary>Relationships</summary>${options(relationships, 'relationships', id => !state.hiddenRelationships.has(id)) || '<p>No relationships loaded.</p>'}</details>
    </div>
    <button data-build-graph>OK — build graph</button>
    <p data-graph-status role="status">No graph built. Choose your selections and press OK.</p>
    <div data-graph-result></div>
  </section>`;
  const query = selector => panel.querySelector(selector);
  const button = query('[data-build-graph]'), status = query('[data-graph-status]'), result = query('[data-graph-result]');
  let disposed = false, disposeRenderer, revision = 0;
  query('.graph-filters').onchange = event => {
    const input = event.target.closest('[data-filter]'); if (!input) return;
    const kind = input.dataset.filter;
    const item = {resources, files, relationships}[kind][Number(input.dataset.index)], id = item.id || item;
    const set = {resources: state.selectedResources, files: state.hiddenFiles, relationships: state.hiddenRelationships}[kind];
    const add = kind === 'resources' ? input.checked : !input.checked;
    if (add) set.add(id); else set.delete(id);
    revision++; button.disabled = false;
    status.textContent = 'Selections changed. Press OK to apply them; the displayed graph has not changed.';
  };
  button.onclick = async () => {
    const request = ++revision;
    const selection = {resources: new Set(resources.filter(r => state.selectedResources.has(r.id)).map(r => r.id)),
      files: new Set(files.filter(id => !state.hiddenFiles.has(id))),
      relationships: new Set(relationships.filter(id => !state.hiddenRelationships.has(id)))};
    if (!selection.resources.size) {
      disposeRenderer?.(); disposeRenderer = undefined; result.innerHTML = '';
      status.textContent = 'No catalogues or profiles selected. Select at least one and press OK.';
      return;
    }
    button.disabled = true; status.textContent = 'Building selected graph…';
    try {
      const {mountGraph} = await loadRenderer();
      // Tab changes, file deletion and subsequent filter edits cancel pending work.
      if (disposed || request !== revision) return;
      const prepared = prepareGraph(documents, getPreview, validate, selection);
      disposeRenderer?.(); disposeRenderer = undefined; result.innerHTML = '';
      const applied = {...state, hiddenResources: new Set(), hiddenFiles: new Set(state.hiddenFiles),
        hiddenRelationships: new Set(state.hiddenRelationships), mode: 'all'};
      disposeRenderer = mountGraph(result, prepared.documents, getPreview, prepared.index, applied);
      status.textContent = 'Graph built. Change selections and press OK to rebuild.';
    } catch (error) {
      if (!disposed && request === revision) status.textContent = `Could not build graph: ${error.message}`;
    } finally {
      if (!disposed && request === revision) button.disabled = false;
    }
  };
  return () => {disposed = true; revision++; disposeRenderer?.();};
}
