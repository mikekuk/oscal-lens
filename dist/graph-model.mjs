import { model } from './engine.mjs';
import { documentPath } from './imports.mjs';
import { locateItem } from './mappings.mjs';

const key = (...values) => JSON.stringify(values);
export function statementParts(parts = [], path = []) {
  return parts.flatMap((part, i) => {
    const graphPath = [...path, i];
    return [{...part, graphPath}, ...statementParts(part.parts, graphPath)];
  });
}

/** Retain map occurrence identity: reverse index entries and multiple items in
 * one collective assertion must never inflate the control-level edge weight. */
export function mappingGraph(documents, getPreview, mappingIndex) {
  const resources = [], nodes = [], occurrences = [], notices = new Set();
  const rowsByDoc = new Map(), nodesByRow = new Map();
  for (const entry of documents.filter(entry => ['catalog', 'profile'].includes(model(entry.doc).type))) {
    const id = documentPath(entry), {type, body} = model(entry.doc);
    resources.push({id, entry, type, title: body.metadata?.title || id});
    try {
      const result = getPreview(entry);
      rowsByDoc.set(entry.doc, result.rows);
      for (const note of result.notes || []) notices.add(note);
      for (const [i, row] of result.rows.entries()) {
        const allParts = statementParts(row.control.parts);
        const partCounts = new Map();
        for (const part of allParts) if (part.id) partCounts.set(part.id, (partCounts.get(part.id) || 0) + 1);
        const parts = allParts.filter(part => !part.id || partCounts.get(part.id) === 1);
        if (parts.length !== allParts.length) notices.add(`${id}: ambiguous section IDs in ${row.control.id} are omitted from expansion.`);
        const node = {id: key(id, row.control.id, i), resource: id, row, entry,
          label: row.control.id, title: row.control.title, parts};
        nodes.push(node); nodesByRow.set(row, node);
      }
    } catch (error) { notices.add(`${id}: ${error.message}`); }
  }
  // A mapping still names its original catalogue/profile even when only its
  // descendant profiles are selected. Index visible controls by exact origin,
  // not by control ID alone, so both ends can follow their inheritance chains.
  const visibleByOrigin = new Map(), endpointCache = new Map();
  for (const node of nodes) {
    for (const origin of [{doc: node.entry.doc, controlId: node.row.control.id}, ...(node.row.lineage || [])]) {
      if (!visibleByOrigin.has(origin.doc)) visibleByOrigin.set(origin.doc, new Map());
      const controls = visibleByOrigin.get(origin.doc);
      if (!controls.has(origin.controlId)) controls.set(origin.controlId, new Set());
      controls.get(origin.controlId).add(node);
    }
  }
  function visibleTargets(item, other) {
    if (!other.entry || !other.rows) return [];
    const doc = other.entry.doc;
    if (!endpointCache.has(doc)) endpointCache.set(doc, new Map());
    const cache = endpointCache.get(doc), id = key(item.type, item['id-ref']);
    if (cache.has(id)) return cache.get(id);
    const original = locateItem(item, other.rows), matches = [];
    if (original.length === 1) {
      const candidates = visibleByOrigin.get(doc)?.get(original[0].row.control.id) || [];
      for (const candidate of candidates) {
        // Check the effective profile content: removed or ambiguous statement
        // targets cannot be restored merely because the catalogue contains them.
        const found = locateItem(item, rowsByDoc.get(candidate.entry.doc));
        if (found.length === 1 && found[0].row === candidate.row) matches.push({item, ...found[0]});
      }
    }
    cache.set(id, matches);
    return matches;
  }
  const seen = new Set(), mapIds = new Map();
  for (const resource of resources) {
    const rows = rowsByDoc.get(resource.entry.doc) || [];
    for (const row of rows) {
      for (const record of mappingIndex.index.get(resource.entry.doc)?.get(row.control) || []) {
        if (!mapIds.has(record.map)) mapIds.set(record.map, mapIds.size);
        const own = record.ownItems.flatMap(item => {
          const matches = locateItem(item, rows);
          return matches.length === 1 ? [{item, ...matches[0]}] : [];
        });
        const other = record.targets.flatMap(item => visibleTargets(item, record.other));
        for (const a of own) for (const b of other) {
          const source = record.reverse ? b : a, target = record.reverse ? a : b;
          const sourceNode = nodesByRow.get(source.row), targetNode = nodesByRow.get(target.row);
          const projectedRecord = !record.inheritedFrom && nodesByRow.get(b.row).entry.doc !== record.other.entry.doc
            ? {...record, inheritedFrom: record.other.entry} : record;
          const occurrence = {id: mapIds.get(record.map), file: documentPath(record.collection),
            relationship: record.map.relationship || 'unspecified', ns: record.map.ns || '', record: projectedRecord,
            source: sourceNode.id, target: targetNode.id,
            sourcePart: source.item.type === 'statement' ? source.node.id : null,
            targetPart: target.item.type === 'statement' ? target.node.id : null};
          const identity = key(occurrence.id, occurrence.file, occurrence.source, occurrence.target,
            occurrence.sourcePart, occurrence.targetPart);
          if (!seen.has(identity)) { seen.add(identity); occurrences.push(occurrence); }
        }
      }
    }
  }
  for (const messages of mappingIndex.notices.values()) for (const message of messages) notices.add(message);
  return {resources, nodes, occurrences, notices: [...notices],
    files: documents.filter(entry => entry.doc['mapping-collection']).map(documentPath),
    relationships: [...new Set(occurrences.map(item => item.relationship))].sort()};
}

/** Degree and connected components use control-to-control links, not statement
 * containment links. These are structural clusters, not compliance judgements. */
export function projectGraph(graph, {resources, files, relationships, expanded = new Set(), mode = 'all'} = {}) {
  let controls = graph.nodes.filter(node => !resources || resources.has(node.resource));
  const allowed = new Set(controls.map(node => node.id));
  const occurrences = graph.occurrences.filter(item => allowed.has(item.source) && allowed.has(item.target)
    && (!files || files.has(item.file)) && (!relationships || relationships.has(item.relationship)));
  const neighbours = new Map(controls.map(node => [node.id, new Set()]));
  for (const item of occurrences) if (item.source !== item.target && item.relationship !== 'no-relationship') {
    neighbours.get(item.source).add(item.target); neighbours.get(item.target).add(item.source);
  }
  const components = [], visited = new Set(), componentById = new Map();
  for (const node of controls) {
    if (visited.has(node.id)) continue;
    const members = [], pending = [node.id]; visited.add(node.id);
    while (pending.length) {
      const id = pending.pop(); members.push(id); componentById.set(id, components.length);
      for (const next of neighbours.get(id)) if (!visited.has(next)) { visited.add(next); pending.push(next); }
    }
    components.push(members);
  }
  const isolated = controls.filter(node => neighbours.get(node.id).size === 0).length;
  controls = controls.filter(node => mode === 'isolated' ? neighbours.get(node.id).size === 0
    : mode === 'weak' ? neighbours.get(node.id).size <= 1
    : mode.startsWith('component:') ? componentById.get(node.id) === Number(mode.split(':')[1]) : true);
  const visible = new Set(controls.map(node => node.id)), nodes = [], edges = new Map();
  for (const node of controls) {
    nodes.push({...node, kind: 'control', degree: neighbours.get(node.id).size});
    if (expanded.has(node.id)) for (const part of node.parts) {
      const id = part.id ? key(node.id, part.id) : key(node.id, null, part.graphPath);
      nodes.push({...node, id, kind: 'statement', label: part.id || part.title || part.name || 'Section', title: part.title || part.name, part, owner: node.id});
      edges.set(key('contains', id), {id: key('contains', id), source: node.id, target: id, kind: 'contains', weight: 0});
    }
  }
  for (const item of occurrences) {
    if (!visible.has(item.source) || !visible.has(item.target)) continue;
    const source = expanded.has(item.source) && item.sourcePart ? key(item.source, item.sourcePart) : item.source;
    const target = expanded.has(item.target) && item.targetPart ? key(item.target, item.targetPart) : item.target;
    const id = key('mapping', source, target, item.relationship, item.ns);
    if (!edges.has(id)) edges.set(id, {id, source, target, kind: 'mapping', relationship: item.relationship,
      weight: 0, records: [], occurrences: new Set()});
    const edge = edges.get(id), occurrenceId = key(item.file, item.id);
    if (!edge.occurrences.has(occurrenceId)) {
      edge.occurrences.add(occurrenceId); edge.weight++; edge.records.push(item);
    }
  }
  return {nodes, edges: [...edges.values()], controls: controls.length, isolated, components,
    totalControls: allowed.size};
}
