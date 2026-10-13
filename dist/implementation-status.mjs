/** SSP presentation status only; profile mapping ancestry is not implementation inheritance. */
export const statusLabels = {
  implemented: 'Implemented', partial: 'Partial', planned: 'Planned',
  'not-applicable': 'N/A', inherited: 'Inherited', unspecified: 'Status not specified'
};
const namespaces = new Set([undefined, '', 'http://csrc.nist.gov/ns/oscal', 'https://fedramp.gov/ns/oscal']);
const list = value => Array.isArray(value) ? value : [];
const normalise = value => {
  const state = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (['n/a', 'na', 'not applicable'].includes(state)) return 'not-applicable';
  return Object.hasOwn(statusLabels, state) ? state : 'unspecified';
};

/** N/A has no work remaining. Unknown states must never imply completion. */
export function rollupStatus(states) {
  if (!states.length) return 'unspecified';
  if (states.every(state => state === 'not-applicable')) return 'not-applicable';
  const applicable = states.filter(state => state !== 'not-applicable');
  if (applicable.every(state => state === 'inherited')) return 'inherited';
  if (applicable.every(state => state === 'implemented' || state === 'inherited')) return 'implemented';
  if (applicable.every(state => state === 'planned')) return 'planned';
  if (applicable.some(state => state === 'partial' || state === 'planned')) return 'partial';
  return 'unspecified';
}

export function declaredStatus(value, fallback = 'unspecified') {
  const props = list(value.props).filter(prop => namespaces.has(prop?.ns));
  const statuses = props.filter(prop => prop.name === 'implementation-status');
  const native = value['implementation-status'];
  let status = native !== undefined ? normalise(native?.state)
    : statuses.length ? rollupStatus(statuses.map(prop => normalise(prop.value))) : fallback;
  // A mere inherited responsibility or mapping does not establish full inheritance.
  const origins = props.filter(prop => prop.name === 'control-origination');
  if (origins.length && origins.every(prop => prop.value === 'inherited') &&
      ['implemented', 'unspecified'].includes(status) &&
      (native === undefined && !statuses.length || status === 'implemented')) status = 'inherited';
  return status;
}

export function statusLeaves(value, fallback = 'unspecified') {
  const own = declaredStatus(value, fallback);
  const children = [...list(value['by-components']), ...list(value.statements)];
  return children.length ? children.flatMap(child => statusLeaves(child, own)) : [own];
}
export function nodeStatus(value, fallback = 'unspecified') {
  return rollupStatus(statusLeaves(value, fallback));
}

/** Use identical component scope for displayed narratives and their status rollup. */
export function scopeImplementation(body, componentId) {
  if (!componentId) return body;
  const selected = componentId instanceof Set ? componentId : new Set([componentId]);
  const keep = values => list(values).filter(value => selected.has(value['component-uuid']));
  const scoped = {...body};
  if (body['by-components']) scoped['by-components'] = keep(body['by-components']);
  if (body.statements) scoped.statements = body.statements
    .filter(statement => !statement['by-components'] || keep(statement['by-components']).length)
    .map(statement => statement['by-components'] ? {...statement, 'by-components': keep(statement['by-components'])} : statement);
  return scoped;
}

export function controlStatus(row, componentId = '') {
  const selected = componentId instanceof Set ? componentId : componentId ? new Set([componentId]) : null;
  const records = list(row.implementations).filter(item => !selected || item.componentIds.some(id => selected.has(id)));
  return rollupStatus(records.flatMap(item => statusLeaves(scopeImplementation(item.body, componentId))));
}

/** Combine the selected components before classifying each control, once. */
export function selectedControlStatus(row, componentIds = null) {
  return controlStatus(row, componentIds);
}

export function summariseImplementation(result, excluded = new Set()) {
  const components = result.components || [];
  const selected = new Set(components.filter(component => !excluded.has(component.id)).map(component => component.id));
  const all = selected.size === components.length;
  const rows = all ? result.rows : result.rows.filter(row => row.componentIds?.some(id => selected.has(id)));
  const groups = Object.fromEntries(Object.keys(statusLabels).map(status => [status, []]));
  for (const row of rows) groups[selectedControlStatus(row, all ? null : selected)].push(row);
  return {groups, total: rows.length, selected, all};
}
