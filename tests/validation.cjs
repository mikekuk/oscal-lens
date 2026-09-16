const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const Ajv = require('../dist/ajv.js');
const manifest = require('../dist/schemas/manifest.json');
const schemas = Object.fromEntries(manifest.map(item => [
  `${item.type}@${item.version}`, require('../dist/' + item.path)
]));
const ready = Promise.all([import('../dist/engine.mjs'), import('../dist/examples.mjs'), import('../dist/views.mjs')]);

test('all released schemas validate valid documents and reject missing required fields', async () => {
  const [{makeValidator}, examples] = await ready;
  const validate = makeValidator(Ajv, schemas);
  const versions = ['1.0.0','1.0.1','1.0.2','1.0.3','1.0.4','1.0.5','1.0.6','1.1.0','1.1.1','1.1.2','1.1.3','1.2.0','1.2.1','1.2.2','1.2.3'];
  assert.deepEqual(manifest.filter(x => x.type === 'catalog').map(x => x.version), versions);
  assert.equal(manifest.length, 34);
  for (const item of manifest) {
    const bytes = fs.readFileSync(path.join(__dirname, '../dist', item.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    const doc = structuredClone(examples[item.type === 'catalog' ? 'exampleCatalog' : item.type === 'profile' ? 'exampleProfile' : 'exampleMapping']);
    doc[item.type].metadata['oscal-version'] = item.version;
    // Use a catalogue structure valid across releases (newer groups cannot mix
    // child groups and controls, and 1.0.5 restricts property names).
    if (item.type === 'catalog') doc.catalog.groups = [{id:'g',title:'Group',controls:[{id:'a',title:'A'}]}];
    assert.deepEqual(validate(doc), [], `${item.type}@${item.version}`);
    delete doc[item.type].uuid;
    assert.ok(validate(doc).some(i => i.severity === 'error' && i.message.includes('uuid')), `${item.type}@${item.version} rejects missing UUID`);
  }
});

test('version selection enforces actual schema differences without latest-version fallback', async () => {
  const [{makeValidator}, {exampleCatalog}] = await ready;
  const validate = makeValidator(Ajv, schemas);
  const doc = structuredClone(exampleCatalog);
  doc.$schema = 'https://example.org/catalog-schema.json';
  doc.catalog.metadata['oscal-version'] = '1.0.4';
  assert.ok(validate(doc).some(i => i.severity === 'error'));
  doc.catalog.metadata['oscal-version'] = '1.0.6';
  assert.deepEqual(validate(doc), []);
  doc.catalog.metadata['oscal-version'] = '1.0.0';
  assert.ok(validate(doc).some(i => i.severity === 'error'));
});

test('missing, malformed, old and future versions never report schema success', async () => {
  const [{makeValidator}, {exampleCatalog}, {renderHeading, renderValidation}] = await ready;
  const validate = makeValidator(Ajv, schemas);
  for (const version of [undefined, null, 104, '', '../1.0.4', 'v1.0.4', '0.9.0', '1.2.99', '1.3.0-rc1']) {
    const doc = structuredClone(exampleCatalog);
    doc.catalog.metadata['oscal-version'] = version;
    const issues = validate(doc);
    assert.ok(issues.some(i => i.code === 'schema-unavailable'));
    assert.ok(!renderHeading({name:'test'}, 'catalog', doc.catalog, {rows:[]}, issues).includes('Schema checks passed'));
    const html = renderValidation(issues, {notes:[]}, null, 'catalog', version);
    assert.match(html, /schema validation was not performed/);
    assert.ok(!html.includes('Checked against bundled'));
  }
  assert.ok(validate({'mapping-collection':{metadata:{'oscal-version':'1.0.4'}}}).some(i => i.code === 'schema-unavailable'));
});

test('validation report identifies the selected release and keeps identifier checks', async () => {
  const [{makeValidator}, {exampleCatalog}, {renderValidation}] = await ready;
  const validate = makeValidator(Ajv, schemas);
  const doc = structuredClone(exampleCatalog);
  doc.catalog.metadata['oscal-version'] = '1.2.3';
  assert.match(renderValidation(validate(doc), {notes:[]}, null, 'catalog', '1.2.3'), /OSCAL 1.2.3 catalog JSON Schema/);
  doc.catalog.controls = [{id:'dup',title:'First'},{id:'dup',title:'Second'}];
  assert.ok(validate(doc).some(i => i.message.includes('Duplicate controls identifier')));
});
