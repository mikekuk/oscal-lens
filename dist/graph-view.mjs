import cytoscape from './vendor/cytoscape.mjs';
import { mappingGraph, projectGraph } from './graph-model.mjs';
import { escapeHtml as esc, renderControls, renderFields } from './views.mjs';

/** Mount a workspace-wide graph. Return a disposer so uploads, deletion and tab
 * changes cannot leave an old renderer or event listeners attached. */
export function mountGraph(panel, documents, getPreview, index, state) {
  const graph = mappingGraph(documents, getPreview, index);
  // Component numbers are recalculated whenever workspace membership changes.
  if (state.mode.startsWith('component:')) state.mode = 'all';
  panel.innerHTML = `<section class="graph-view">
    <div class="graph-toolbar"><label>Explore <select data-mode></select></label>
      <button data-action="layout">Rearrange</button><button data-action="fit">Fit graph</button>
      <button data-action="in" aria-label="Zoom in">＋</button><button data-action="out" aria-label="Zoom out">−</button>
      <button data-action="collapse">Collapse statements</button><button data-action="unpin">Unpin all</button>
      <label>Find node <input type="search" data-find placeholder="Control ID or title"></label>
    </div>
    <p class="graph-count" role="status"></p>
    <div class="graph-stage"><div class="graph-canvas" aria-label="Interactive mapping network"></div><div class="graph-node-actions"></div></div>
    <p class="side-foot">Drag nodes to move and pin them. Drag the background to pan; scroll to zoom. Use + beside a selected control to expand its sections / statements. Line width and layout attraction reflect distinct mapping occurrences, not assurance or compliance. Arrows preserve source → target direction.</p>
    <details><summary>Accessible node list / details</summary><div class="graph-node-list"></div></details>
    <details class="graph-notices" ${graph.notices.length ? 'open' : ''}><summary>Resolution notices (${graph.notices.length})</summary>${graph.notices.map(n => `<p>${esc(n)}</p>`).join('')}</details>
    <dialog class="graph-dialog" aria-label="Mapping network details"><button data-close>Close</button><div class="graph-detail"></div></dialog>
  </section>`;
  const query = selector => panel.querySelector(selector);
  const cy = cytoscape({container: query('.graph-canvas'), elements: [], minZoom: .08, maxZoom: 4,
    style: [
      {selector: 'node', style: {'background-color': 'data(colour)', label: 'data(label)', color: '#eef4ff',
        'text-valign': 'bottom', 'text-margin-y': 7, 'font-size': 11, width: 28, height: 28,
        'text-background-color': '#111b2b', 'text-background-opacity': .85, 'text-background-padding': 3}},
      {selector: 'node[kind = "statement"]', style: {shape: 'round-rectangle', width: 18, height: 18, 'font-size': 9}},
      {selector: 'node[degree = 0]', style: {'border-width': 3, 'border-style': 'dashed', 'border-color': '#f8fafc'}},
      {selector: ':selected', style: {'border-width': 4, 'border-color': '#fff', 'line-color': '#fff'}},
      {selector: 'edge', style: {'curve-style': 'bezier', 'line-color': '#8294b2', 'target-arrow-color': '#8294b2',
        'target-arrow-shape': 'triangle', width: e => 1 + Math.log2(1 + e.data('weight')) * 1.5,
        label: e => e.data('weight') > 1 ? String(e.data('weight')) : '', 'font-size': 10, color: '#e2e8f0',
        'text-background-color': '#111b2b', 'text-background-opacity': 1}},
      {selector: 'edge[kind = "contains"]', style: {'line-style': 'dotted', 'target-arrow-shape': 'none', width: 1, label: '', opacity: .45}},
      {selector: 'edge[relationship = "no-relationship"]', style: {'line-style': 'dashed', opacity: .35}}
    ]});
  let projection, layout, selectedId, disposed = false;
  const dialog = query('dialog');
  function details(html) { query('.graph-detail').innerHTML = html; if (!dialog.open) dialog.showModal(); }
  query('[data-close]').onclick = () => dialog.close();
  function inspect(node) {
    const resource = graph.resources.find(r => r.id === node.resource);
    const row = {...node.row, mappings: index.index.get(node.entry.doc)?.get(node.row.control) || []};
    details(`<h3>${esc(resource.title)} · ${esc(node.label)}</h3>${node.part ? renderFields(Object.fromEntries(Object.entries(node.part).filter(([key]) => key !== 'graphPath'))) : ''}` +
      renderControls(resource.type, {rows: [row], notes: []}, null, 0, '', '', {parameters: false}));
  }
  function savePositions() {
    cy.nodes().forEach(node => state.positions.set(node.id(), {...node.position(), pinned: node.locked()}));
  }
  function updateActions() {
    const actions = query('.graph-node-actions');
    const node = selectedId && cy.getElementById(selectedId);
    if (!node?.length) { actions.innerHTML = ''; return; }
    const data = projection.nodes.find(n => n.id === selectedId), pos = node.renderedPosition();
    actions.style.left = `${Math.max(0, Math.min(query('.graph-stage').clientWidth - 135, pos.x + 20))}px`;
    actions.style.top = `${Math.max(0, Math.min(540, pos.y - 20))}px`;
    actions.innerHTML = `<button data-node-action="details" aria-label="Details for ${esc(data.label)}">Details</button>` +
      (data.kind === 'control' && data.parts.length ? `<button data-node-action="expand" aria-label="${state.expanded.has(data.id) ? 'Collapse' : 'Expand'} statements for ${esc(data.label)}">${state.expanded.has(data.id) ? '−' : '+'}</button>` : '') +
      `<button data-node-action="pin">${node.locked() ? 'Unpin' : 'Pin'}</button>`;
  }
  function arrange() {
    layout?.stop();
    // Negative relationships must not pull otherwise unrelated controls together.
    const elements = cy.elements().filter(e => !e.isEdge() || e.data('relationship') !== 'no-relationship');
    layout = elements.layout({name: 'cose', animate: false, randomize: false, fit: true, padding: 45,
      nodeRepulsion: () => 180000, componentSpacing: 100, numIter: 700,
      idealEdgeLength: edge => edge.data('kind') === 'contains' ? 50 : 130 / Math.sqrt(Math.max(1, edge.data('weight'))),
      edgeElasticity: edge => 100 / Math.sqrt(Math.max(1, edge.data('weight')))});
    layout.run(); updateActions();
  }
  function redraw(rearrange = false) {
    savePositions(); layout?.stop();
    const filters = {resources: new Set(graph.resources.map(r => r.id).filter(id => !state.hiddenResources.has(id))),
      files: new Set(graph.files.filter(id => !state.hiddenFiles.has(id))),
      relationships: new Set(graph.relationships.filter(id => !state.hiddenRelationships.has(id))), expanded: state.expanded, mode: state.mode};
    projection = projectGraph(graph, filters);
    const mode = query('[data-mode]');
    mode.innerHTML = '<option value="all">All controls</option><option value="isolated">Isolated controls (0 neighbours)</option><option value="weak">Weakly connected (0–1 neighbours)</option>' +
      projection.components.map((members, i) => members.length > 1 ? `<option value="component:${i}">Cluster ${i + 1} · ${members.length} controls</option>` : '').join('');
    mode.value = state.mode;
    cy.elements().remove();
    cy.add(projection.nodes.map((node, i) => ({group: 'nodes', data: {id: node.id, label: node.label, kind: node.kind,
      degree: node.degree ?? -1, colour: state.colours.get(node.resource)},
      position: state.positions.get(node.id) || {x: (i % 15) * 90, y: Math.floor(i / 15) * 90}})));
    cy.add(projection.edges.map(edge => ({group: 'edges', data: {id: edge.id, source: edge.source, target: edge.target,
      kind: edge.kind, weight: edge.weight, relationship: edge.relationship || ''}})));
    cy.nodes().forEach(node => { if (state.positions.get(node.id())?.pinned) node.lock(); });
    const links = projection.edges.filter(e => e.kind === 'mapping');
    query('.graph-count').textContent = `${projection.controls} / ${projection.totalControls} controls · ${links.length} connections · ${projection.isolated} isolated controls in filter scope · ${projection.components.filter(c => c.length > 1).length} connected clusters` + (projection.nodes.length ? '' : ' · No controls match these filters.');
    query('.graph-node-list').innerHTML = projection.nodes.map((n, i) => `<button data-list-node="${i}">${esc(n.label)} · ${esc(n.title)}${n.kind === 'control' ? ` · ${n.degree} neighbours` : ''}</button>`).join('');
    if (rearrange) arrange(); else updateActions();
  }
  query('[data-mode]').onchange = event => {state.mode = event.target.value; redraw(); cy.fit(undefined, 45);};
  query('.graph-toolbar').onclick = event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'layout') arrange();
    if (action === 'fit') cy.fit(undefined, 45);
    if (action === 'in' || action === 'out') cy.zoom({level: cy.zoom() * (action === 'in' ? 1.3 : 1 / 1.3), renderedPosition: {x: cy.width() / 2, y: cy.height() / 2}});
    if (action === 'collapse') {state.expanded.clear(); redraw();}
    if (action === 'unpin') {cy.nodes().unlock(); savePositions(); updateActions();}
  };
  query('[data-find]').oninput = event => {
    const value = event.target.value.trim().toLowerCase(); if (!value) return;
    const node = projection.nodes.find(n => `${n.label} ${n.title}`.toLowerCase().includes(value));
    if (node) {selectedId = node.id; cy.nodes().unselect(); cy.getElementById(node.id).select(); cy.center(cy.getElementById(node.id)); updateActions();}
  };
  query('.graph-node-actions').onclick = event => {
    const action = event.target.closest('[data-node-action]')?.dataset.nodeAction;
    const data = projection.nodes.find(n => n.id === selectedId); if (!data) return;
    if (action === 'details') inspect(data);
    if (action === 'expand') {if (state.expanded.has(data.id)) state.expanded.delete(data.id); else state.expanded.add(data.id); redraw(true);}
    if (action === 'pin') {const node = cy.getElementById(data.id); if (node.locked()) node.unlock(); else node.lock(); savePositions(); updateActions();}
  };
  query('.graph-node-list').onclick = event => {
    const button = event.target.closest('[data-list-node]'); if (!button) return;
    selectedId = projection.nodes[Number(button.dataset.listNode)].id; updateActions();
    inspect(projection.nodes[Number(button.dataset.listNode)]);
  };
  cy.on('tap', 'node', event => {selectedId = event.target.id(); updateActions(); inspect(projection.nodes.find(n => n.id === selectedId));});
  cy.on('tap', 'edge', event => {
    const edge = projection.edges.find(e => e.id === event.target.id()); if (edge.kind !== 'mapping') return;
    details(`<h3>${esc(edge.relationship)} · ${edge.weight} mapping occurrence(s)</h3><p>Direction: original source → target. Collective maps apply to the complete sets below, not independently to every displayed pair.</p>` + edge.records.map(item =>
      `<section><h4>${esc(item.file)}</h4>${item.record.inheritedFrom ? '<p>Inherited mapping: profile tailoring does not reassess the relationship.</p>' : ''}${renderFields({sources: item.record.map.sources, targets: item.record.map.targets, namespace: item.ns, remarks: item.record.map.remarks, qualifiers: item.record.map.qualifiers})}</section>`).join(''));
  });
  cy.on('mouseover', 'node', event => {
    const node = projection.nodes.find(n => n.id === event.target.id());
    query('.graph-canvas').title = `${node.label} · ${node.title}`;
  });
  cy.on('mouseout', 'node', () => {query('.graph-canvas').title = '';});
  cy.on('free', 'node', event => {event.target.lock(); savePositions(); updateActions();});
  cy.on('pan zoom position', updateActions);
  const observer = new ResizeObserver(() => {if (!disposed) {cy.resize(); updateActions();}});
  observer.observe(query('.graph-stage'));
  redraw(true);
  return () => {disposed = true; savePositions(); layout?.stop(); observer.disconnect(); cy.destroy();};
}
