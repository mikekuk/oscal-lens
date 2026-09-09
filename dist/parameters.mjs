/** Resolve OSCAL parameter insertions as plain text; HTML escaping belongs to the view. */
const INSERT = /\{\{\s*insert:\s*param\s*,\s*([^{}]+?)\s*\}\}/g;

// Parameters in nearer scopes replace definitions inherited from outer scopes.
export function parameterScope(inherited, parameters = []) {
  const scope = {
    ...inherited
  };
  for (const parameter of parameters) scope[parameter.id] = parameter;
  return scope;
}

export function substituteParameters(prose, parameters = {}, trail = []) {
  return String(prose ?? '').replace(INSERT, (_, rawId) => {
    const id = rawId.trim();
    if (trail.includes(id)) return `[Circular parameter: ${id}]`;
    const parameter = parameters[id];
    if (!parameter) return `[Undefined parameter: ${id}]`;
    const expand = text => substituteParameters(text, parameters, [...trail, id]);

    // Effective profile values take precedence over assignment/selection prompts.
    if (parameter.values?.length) return parameter.values.map(expand).join('; ');
    if (parameter.select?.choice?.length) {
      const quantity = parameter.select['how-many'] === 'one-or-more' ? 'one or more' : 'one';
      return `[Selection (${quantity}): ${parameter.select.choice.map(expand).join('; ')}]`;
    }
    const label = parameter.label || parameter.usage || id;
    return `[Assignment: ${expand(label)}]`;
  });
}
