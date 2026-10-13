import { resolveImport, documentPath } from './imports.mjs';

export const implementationTypes = ['system-security-plan', 'component-definition'];
const list = value => Array.isArray(value) ? value : [];
const clone = value => structuredClone(value);

/** Keep implementation narratives separate from inherited requirement text. */
export function implementationPreview(doc, documents, trail, preview, model) {
  const {type, body} = model(doc);
  const source = documents.find(entry => entry.doc === doc) || {name: type + '.json'};
  const rows = [], sources = [], notes = [], components = [];
  const byComponent = new Map(), importedRows = new Map();
  function component(value, defined = true) {
    const id = value.uuid;
    if (!id) return;
    if (byComponent.has(id)) {
      if (defined) notes.push('Duplicate component UUID: ' + id + '. The first definition is shown.');
      return byComponent.get(id);
    }
    const result = {id, title: value.title || id, defined, implemented: false, body: value};
    byComponent.set(id, result); components.push(result);
    return result;
  }
  function reference(id) {
    return byComponent.get(id) || component({uuid: id}, false);
  }
  function load(href, owner = body, entry = source) {
    try {
      const target = resolveImport(owner, href, entry, documents);
      if (!['catalog', 'profile'].includes(model(target.doc).type)) throw Error('Implementation source must be a catalogue or profile.');
      if (!importedRows.has(target.doc)) {
        const result = preview(target.doc, documents, [...trail, doc]);
        sources.push(...result.sources); notes.push(...result.notes);
        importedRows.set(target.doc, result.rows.map(row => ({...row,
          control: clone(row.control), parameters: clone(row.parameters || {}),
          lineage: [...(row.lineage || []), {doc: target.doc, controlId: row.control.id}],
          source: documentPath(target), implementations: [], componentIds: []
        })));
      }
      return importedRows.get(target.doc);
    } catch (error) { notes.push(error.message); return []; }
  }
  function attach(requirement, candidates, implementation, settings = []) {
    const id = requirement['control-id'];
    const matches = candidates.filter(row => row.control.id === id);
    let row;
    if (matches.length === 1) row = matches[0];
    else {
      notes.push(`${matches.length ? 'Ambiguous' : 'Unresolved'} implementation control: ${id}. Source requirements and mappings are unavailable for this implementation.`);
      row = {control: {id, title: id}, groups: [], parents: [], parameters: {}, implementations: [], componentIds: []};
    }
    if (!rows.includes(row)) rows.push(row);
    // Only requirement-wide assignments affect shared requirement text. Component
    // and statement assignments remain scoped to their implementation narratives.
    for (const setting of type === 'system-security-plan' ? [...settings, ...list(requirement['set-parameters'])] : []) {
      const id = setting['param-id'];
      row.parameters[id] = {...(row.parameters[id] || {id}), ...clone(setting)};
      delete row.parameters[id]['param-id'];
    }
    if (type === 'component-definition' && settings.length) implementation.settings = clone(settings);
    row.implementations.push(implementation);
    for (const id of implementation.componentIds) {
      if (!row.componentIds.includes(id)) row.componentIds.push(id);
      const entry = reference(id);
      if (entry) entry.implemented = true;
    }
  }
  if (type === 'system-security-plan') {
    for (const value of list(body['system-implementation']?.components)) component(value);
    const candidates = load(body['import-profile']?.href);
    rows.push(...candidates);
    for (const row of candidates) for (const setting of list(body['control-implementation']?.['set-parameters'])) {
      const id = setting['param-id'];
      row.parameters[id] = {...(row.parameters[id] || {id}), ...clone(setting)};
      delete row.parameters[id]['param-id'];
    }
    for (const requirement of list(body['control-implementation']?.['implemented-requirements'])) {
      const contributions = [...list(requirement['by-components']), ...list(requirement.statements).flatMap(statement => list(statement['by-components']))];
      const ids = [...new Set(contributions.map(value => value['component-uuid']).filter(Boolean))];
      attach(requirement, candidates, {body: requirement, componentIds: ids}, list(body['control-implementation']?.['set-parameters']));
    }
  } else {
    const definitions = [], visited = new Set();
    function collect(entry, chain = []) {
      if (chain.includes(entry.doc)) { notes.push('Circular component-definition import detected.'); return; }
      if (visited.has(entry.doc)) return;
      visited.add(entry.doc);
      const definition = entry.doc['component-definition'];
      definitions.push({entry, definition});
      for (const value of list(definition.components)) component(value);
      for (const directive of list(definition['import-component-definitions'])) {
        try {
          const target = resolveImport(definition, directive.href, entry, documents);
          if (!target.doc['component-definition']) throw Error('Component definition import must reference a component definition.');
          collect(target, [...chain, entry.doc]);
        } catch (error) { notes.push(error.message); }
      }
    }
    collect(source.doc ? source : {...source, doc});
    for (const {entry, definition} of definitions) {
      const owners = [...list(definition.components).map(value => ({value, ids: [value.uuid]})),
        ...list(definition.capabilities).map(value => ({value, ids: list(value['incorporates-components']).map(item => item['component-uuid'])}))];
      for (const {value, ids} of owners) for (const implementation of list(value['control-implementations'])) {
        const candidates = load(implementation.source, definition, entry);
        for (const requirement of list(implementation['implemented-requirements'])) {
          attach(requirement, candidates, {body: requirement, componentIds: ids.filter(Boolean),
            title: value.name || value.title, source: implementation.source,
            description: implementation.description}, list(implementation['set-parameters']));
        }
      }
    }
  }
  for (const value of components) if (!value.defined) notes.push('Implementation references an undefined component: ' + value.id);
  return {rows, sources: [...new Set(sources)], notes: [...new Set(notes)], components};
}
