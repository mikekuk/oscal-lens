import {
  applyAlterations
} from './alterations.mjs';
import {
  parameterScope
} from './parameters.mjs';
import {
  resolveImport,
  documentPath
} from './imports.mjs';
/** Identify the supported OSCAL root before accessing its contents. */
export function model(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw Error(
    'Expected an OSCAL JSON object.');
  const types = ['catalog', 'profile'].filter(k => doc[k]);
  if (types.length !== 1) throw Error('Provide exactly one catalog or profile root.');
  if (typeof doc[types[0]] !== 'object' || Array.isArray(doc[types[0]])) throw Error(
    'OSCAL root must be an object.');
  return {
    type: types[0],
    body: doc[types[0]]
  }
}
/** Flatten controls for display while retaining group and parent-control context. */
export function flatten(root) {
  const rows = [];

  function visit(node, groups = [], parents = [], inheritedParameters = {}) {
    const parameters = parameterScope(inheritedParameters, node.params);
    for (const group of node.groups || []) visit(group, [...groups, group], parents, parameters);
    for (const control of node.controls || []) {
      rows.push({
        control,
        groups,
        parents,
        parameters: parameterScope(parameters, control.params)
      });
      visit(control, groups, [...parents, control.id], parameters);
    }
  }
  visit(root);
  return rows;
}

/** Compile schemas once, then return all schema and identifier issues per document. */
export function makeValidator(Ajv, schemas) {
  const ajv = new Ajv({
    allErrors: true,
    strict: false
  });
  // Lightweight format checks supplement the patterns in the bundled NIST schemas.
  // They are deliberately not described as exhaustive RFC conformance checks.
  ajv.addFormat('uri', s => {
    try {
      return !!new URL(s).protocol && !/\s/.test(s)
    } catch {
      return false
    }
  });
  ajv.addFormat('uri-reference', s => {
    try {
      new URL(s, 'https://example.org/');
      return !/[\s<>]/.test(s)
    } catch {
      return false
    }
  });
  ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  ajv.addFormat('date-time', s =>
    /^\d{4}-\d\d-\d\d[Tt]\d\d:\d\d:\d\d(?:\.\d+)?(?:[Zz]|[+-]\d\d:\d\d)$/.test(s) && !Number
    .isNaN(Date.parse(s)));
  const validators = Object.fromEntries(Object.entries(schemas).map(([k, s]) => [k, ajv.compile(
    s)]));
  return doc => {
    let m;
    try {
      m = model(doc)
    } catch (e) {
      return [{
        severity: 'error',
        path: '/',
        message: e.message
      }]
    }
    const v = validators[m.type];
    v(doc);
    const issues = (v.errors || []).map(e => ({
      severity: 'error',
      path: e.instancePath || '/',
      message: e.message + (e.params?.missingProperty ? ' (' + e.params.missingProperty +
        ')' : '')
    }));
    // Passing an older schema cannot establish conformance to a newer OSCAL version.
    if (m.body.metadata?.['oscal-version'] !== '1.0.4') issues.unshift({
      severity: 'warning',
      path: '/metadata/oscal-version',
      message: 'Bundled schema is OSCAL 1.0.4. This document’s declared version is not supported for conformance validation.'
    });
    // Namespace identifier checks by assembly type, preserving the existing policy.
    const seen = new Map();

    function walk(x, path = '') {
      if (!x || typeof x !== 'object') return;
      for (const [k, v] of Object.entries(x)) {
        const p = path + '/' + k;
        if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i++) {
            const item = v[i];
            const id = item?.id || item?.uuid;
            if (id && ['controls', 'groups', 'params', 'parts', 'resources', 'parties', 'roles',
                'locations'
              ].includes(k)) {
              const key = k + ':' + id;
              if (seen.has(key)) issues.push({
                severity: 'error',
                path: p + '/' + i,
                message: 'Duplicate ' + k + ' identifier: ' + id
              });
              seen.set(key, true)
            }
            walk(item, p + '/' + i)
          }
        } else if (v && typeof v === 'object') walk(v, p)
      }
    }
    walk(m.body);
    return issues
  }
}
const clone = x => JSON.parse(JSON.stringify(x));

// OSCAL selectors use wildcard strings, not arbitrary regular expressions.
function matches(row, selectors = []) {
  return selectors.some(selector => {
    const identifiers = selector['with-ids'] || [];
    const patterns = (selector.matching || []).map(matching => {
      const escapedSegments = matching.pattern.split('*').map(segment =>
        segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp('^' + escapedSegments.join('.*') + '$');
    });
    const matchesId = id => identifiers.includes(id) || patterns.some(pattern => pattern.test(id));
    // Selecting a parent only includes its enhancements when explicitly requested.
    return matchesId(row.control.id) ||
      (selector['with-child-controls'] === 'yes' && row.parents.some(matchesId));
  });
}

/**
 * Build a selection preview from catalogue/profile imports.
 * This is not a complete OSCAL resolver: unsupported merge directives are
 * reported in notes, and source groups remain available for contextual display.
 * `trail` tracks the active import chain, rather than all previously seen files.
 */
export function preview(doc, documents, trail = []) {
  const {
    type,
    body
  } = model(doc);
  if (type === 'catalog') return {
    rows: flatten(body),
    sources: [body],
    notes: []
  };
  if (trail.includes(doc)) throw Error('Circular profile import detected.');
  const rows = [],
    sources = [],
    notes = [];
  // Resolve dependencies first so selection operates on their effective controls.
  for (const importDirective of body.imports || []) {
    const source = documents.find(d => d.doc === doc) || {
      name: 'profile.json'
    };
    const target = resolveImport(body, importDirective.href, source, documents);
    const imported = preview(target.doc, documents, [...trail, doc]);
    sources.push(...imported.sources);
    notes.push(...imported.notes);
    for (const selector of [...(importDirective['include-controls'] || []), ...(importDirective[
        'exclude-controls'] || [])])
      for (const id of selector['with-ids'] || [])
        if (!imported.rows.some(row => row.control.id === id)) throw Error(
          'Unknown selected control: ' + id);
    const selected = imported.rows.filter(row => ('include-all' in importDirective || matches(row,
      importDirective[
        'include-controls'])) && !matches(row, importDirective['exclude-controls']));
    // Tailoring must never mutate the uploaded catalogue or another profile view.
    rows.push(...selected.map(row => ({
      ...row,
      control: clone(row.control),
      parameters: clone(row.parameters || {}),
      source: documentPath(target)
    })));
  }
  // Expose incomplete processing instead of silently claiming a resolved result.
  const duplicates = rows.filter((row, i) => rows.findIndex(candidate => candidate.control.id === row.control
      .id) !==
    i);
  if (duplicates.length) notes.push('Duplicate controls across imports: ' + [...new Set(duplicates
    .map(row => row.control.id))].join(', ') + '. Combine behaviour is not applied.');
  if (body.merge?.custom) notes.push(
    'Custom group ordering is not applied. Source groups are shown.');
  if (body.merge?.combine) notes.push('Merge combine directives are not applied.');
  if (body.merge?.['as-is'] === false || body.merge?.flat) notes.push(
    'Source grouping is retained for this selection preview.');
  applyAlterations(rows, body.modify?.alters, notes);
  // Each row owns its effective scope, including catalogue/group/parent parameters.
  // Applying outer profile settings last preserves overlay precedence without
  // mutating uploaded documents or previews belonging to another profile.
  for (const setting of body.modify?.['set-parameters'] || []) {
    const parameterId = setting['param-id'];
    let found = false;
    for (const row of rows) {
      const parameter = row.parameters[parameterId];
      if (!parameter) continue;
      Object.assign(parameter, clone(setting));
      delete parameter['param-id'];
      for (const local of row.control.params || []) {
        if (local.id === parameterId) Object.assign(local, clone(parameter));
      }
      found = true;
    }
    if (!found) notes.push('Parameter ' + parameterId +
      ' is outside selected control scopes; its setting is not applied.');
  }
  return {
    rows,
    sources,
    notes: [...new Set(notes)]
  }
}
