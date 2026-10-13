const {test} = require('node:test');
const assert = require('node:assert/strict');
const ready = Promise.all([import('../dist/engine.mjs'), import('../dist/examples.mjs'), import('../dist/views.mjs'), import('../dist/mappings.mjs'), import('../dist/imports.mjs'), import('../dist/graph-settings.mjs'), import('../dist/graph-model.mjs')]);
async function workspace() {
  const [engine, examples, views, mappings, imports, settings, graph] = await ready;
  const docs = [['example-profile.json','exampleProfile'], ['example-catalog.json','exampleCatalog'], ['example-assurance.json','exampleMappedCatalog'], ['example-mapping.json','exampleMapping'], ['example-ssp.json','exampleSSP'], ['example-component.json','exampleComponentDefinition']].map(([name,key])=>({name,doc:structuredClone(examples[key])}));
  const cache = new Map();
  const get = entry => {if (!cache.has(entry.doc)) cache.set(entry.doc, engine.preview(entry.doc,docs)); return cache.get(entry.doc);};
  return {engine, views, mappings, imports, settings, graph, docs, get, ssp:docs[4], cd:docs[5]};
}
test('SSP includes declared components, requirement and statement references, and unimplemented baseline controls', async()=>{
  const {docs,get,ssp} = await workspace();
  const body=ssp.doc['system-security-plan'];
  body['control-implementation']['implemented-requirements'][0].statements[0]['by-components'].push({'component-uuid':'unknown',description:'Unknown component narrative'});
  const before=JSON.stringify(docs), result=get(ssp);
  assert.equal(result.rows.length,get(docs[0]).rows.length);
  assert.equal(result.components.length,3);
  assert.equal(result.components[1].implemented,false);
  assert.equal(result.components[2].defined,false);
  assert.ok(result.components[2].implemented);
  assert.ok(result.rows.find(row=>row.control.id==='ac-1').componentIds.includes('unknown'));
  assert.match(result.notes.join(' '),/undefined component: unknown/);
  assert.equal(JSON.stringify(docs),before);
});
test('component filtering shows only its contributions, retains empty definitions, and escapes prose', async()=>{
  const {get,ssp,views}=await workspace();
  const body=ssp.doc['system-security-plan'], req=body['control-implementation']['implemented-requirements'][0];
  req['by-components'].push({'component-uuid':'other',description:'OTHER-PRIVATE-NARRATIVE'});
  req.statements[0]['by-components'].push({'component-uuid':'other',description:'OTHER-STATEMENT'});
  req['by-components'][0].description='<script>alert(1)</script>';
  const result=get(ssp), id=result.components[0].id;
  const html=views.renderControls('system-security-plan',result,null,0,id,'');
  assert.match(html,/&lt;script&gt;alert/);
  assert.doesNotMatch(html,/<script>|OTHER-PRIVATE-NARRATIVE|OTHER-STATEMENT/);
  assert.match(html,/Gateway policy review/);
  const empty=views.renderControls('system-security-plan',result,null,0,result.components[1].id,'');
  assert.match(empty,/Reporting service/); assert.match(empty,/No controls match/);
  assert.match(views.renderGroups([],result,id),/Defined · Implemented/);
});
test('SSPs and component definitions inherit exact profile mappings in any upload order and project them in graphs', async()=>{
  const {docs,get,ssp,cd,mappings,settings,graph}=await workspace();
  for(const ordered of [docs,[...docs].reverse()]) {
    const index=mappings.buildMappingIndex(ordered,get);
    for(const entry of [ssp,cd]) {
      const row=get(entry).rows.find(row=>row.control.id==='ac-1');
      const records=index.index.get(entry.doc).get(row.control);
      assert.ok(records.length); assert.ok(records.every(record=>record.inheritedFrom));
      assert.equal(records.length,index.index.get(docs[0].doc).get(get(docs[0]).rows.find(row=>row.control.id==='ac-1').control).length);
    }
  }
  const selection={resources:new Set([ssp.name,cd.name,docs[2].name]),files:new Set([docs[3].name]),relationships:new Set(['intersects-with','subset-of'])};
  const prepared=settings.prepareGraph(docs,get,()=>[],selection);
  const built=graph.mappingGraph(prepared.documents,get,prepared.index);
  assert.ok(built.occurrences.length);
  assert.ok(built.nodes.some(node=>node.entry===ssp));
  assert.ok(built.nodes.some(node=>node.entry===cd));
});
test('missing sources preserve implementation narratives without guessed mapping inheritance', async()=>{
  const {docs,get,ssp,cd,mappings}=await workspace();
  docs.splice(0,1);
  for(const entry of [ssp,cd]) {
    const result=get(entry);
    assert.equal(result.rows.length,1); assert.ok(result.rows[0].implementations.length);
    assert.match(result.notes.join(' '),/Missing JSON import/);
    assert.equal(result.rows[0].lineage,undefined);
    assert.equal(mappings.buildMappingIndex(docs,get).index.has(entry.doc),false);
  }
});
test('component imports resolve relative paths, include capabilities, detect cycles and retain empty components', async()=>{
  const {docs,get,cd}=await workspace();
  const body=cd.doc['component-definition'];
  cd.path='root/components/main.json';
  const child={name:'child.json',path:'root/components/child.json',doc:{'component-definition':{
    components:[{uuid:'empty',title:'Empty component'}],
    'import-component-definitions':[{href:'main.json'}],
    capabilities:[{name:'Shared capability','incorporates-components':[{'component-uuid':'empty'}],
      'control-implementations':[{'source':'../profiles/p.json','implemented-requirements':[{'control-id':'ac-1',description:'Capability narrative'}]}]}]
  }}};
  docs[0].path='root/profiles/p.json'; docs[1].path='root/profiles/example-catalog.json';
  body['import-component-definitions']=[{href:'child.json'}];
  body.components[0]['control-implementations'][0].source='../profiles/p.json'; docs.push(child);
  const result=get(cd);
  assert.equal(result.components.length,2);
  assert.ok(result.components.find(c=>c.id==='empty').implemented);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].implementations.length,2);
  assert.match(result.notes.join(' '),/Circular component-definition import/);
});
test('SSP parameter precedence preserves profile scopes; component assignments cannot leak across components', async()=>{
  const {get,ssp,cd,docs}=await workspace();
  const s=ssp.doc['system-security-plan']['control-implementation'];
  s['set-parameters']=[{'param-id':'ac-1_prm',values:['monthly']}];
  s['implemented-requirements'][0]['set-parameters']=[{'param-id':'ac-1_prm',values:['weekly']}];
  assert.deepEqual(get(ssp).rows.find(r=>r.control.id==='ac-1').parameters['ac-1_prm'].values,['weekly']);
  assert.deepEqual(get(docs[0]).rows.find(r=>r.control.id==='ac-1').parameters['ac-1_prm'].values,['every six months']);
  const body=cd.doc['component-definition'], second=structuredClone(body.components[0]);
  second.uuid='second'; second['control-implementations'][0]['set-parameters']=[{'param-id':'ac-1_prm',values:['daily']}]; body.components.push(second);
  const row=get(cd).rows[0];
  assert.deepEqual(row.parameters['ac-1_prm'].values,['every six months']);
  assert.deepEqual(row.implementations[1].settings[0].values,['daily']);
});
test('loaders accept both models and reject mixed roots; profiles reject implementation models as imports', async()=>{
  const {docs,ssp,cd,imports,engine}=await workspace();
  for(const folder of [false,true]) {
    const result=await imports.readDocuments([ssp,cd].map(entry=>({name:entry.name,size:1,text:async()=>JSON.stringify(entry.doc)})),[],{folder});
    assert.equal(result.added,2); assert.deepEqual(result.errors,[]);
  }
  assert.throws(()=>engine.model({...ssp.doc,...cd.doc}),/exactly one/);
  docs[0].doc.profile.imports[0].href=ssp.name;
  assert.throws(()=>engine.preview(docs[0].doc,docs),/must reference a catalogue or profile/);
});
test('component definitions with identical control IDs from different profiles retain independent mapping ancestry', async()=>{
  const {docs,cd,get,mappings}=await workspace();
  const unrelated={name:'unrelated.json',doc:{catalog:{controls:[{id:'ac-1',title:'Unrelated requirement'}]}}};
  const profile={name:'unrelated-profile.json',doc:{profile:{imports:[{href:unrelated.name,'include-all':{}}]}}};
  docs.push(unrelated,profile);
  const body=cd.doc['component-definition'];
  const second=structuredClone(body.components[0]); second.uuid='second';
  second['control-implementations'][0].source=profile.name; body.components.push(second);
  const result=get(cd), index=mappings.buildMappingIndex(docs,get).index.get(cd.doc);
  assert.equal(result.rows.length,2);
  assert.ok(index.get(result.rows[0].control)?.length);
  assert.equal(index.get(result.rows[1].control),undefined);
  assert.equal(result.rows[1].control.title,'Unrelated requirement');
});
