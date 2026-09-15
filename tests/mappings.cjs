const { test } = require('node:test');
const assert = require('node:assert/strict');
const ready = Promise.all([import('../dist/engine.mjs'), import('../dist/mappings.mjs'), import('../dist/imports.mjs'), import('../dist/views.mjs')]);
function workspace() {
  const a = {name:'a.json',path:'root/catalogs/a.json',doc:{catalog:{controls:[{id:'a',title:'A',params:[{id:'p',values:['yearly']}],parts:[{id:'a.s',name:'statement',prose:'Review {{ insert: param, p }}.'}]}]}}};
  const b = {name:'b.json',path:'root/catalogs/b.json',doc:{catalog:{controls:[{id:'b',title:'B',params:[{id:'q',values:['daily']}],parts:[{id:'b.s',name:'statement',prose:'Target full statement <script>bad</script>'}]}]}}};
  const m = {name:'map.json',path:'root/anywhere/map.json',doc:{'mapping-collection':{mappings:[{'source-resource':{type:'catalog',href:'../catalogs/a.json'},'target-resource':{type:'catalog',href:'../catalogs/b.json'}, maps:[{relationship:'subset-of',sources:[{type:'statement','id-ref':'a.s'}],targets:[{type:'control','id-ref':'b'}],remarks:'Mapping logic'}]}]}}};
  return [a,b,m];
}
function cached(docs, preview) {
  const cache = new Map();
  return entry => {if (!cache.has(entry.doc)) cache.set(entry.doc,preview(entry.doc,docs)); return cache.get(entry.doc);};
}
test('discovers maps anywhere, renders full controls safely, and reverses direction',async()=>{
  const [{preview},{buildMappingIndex},,{renderControls}] = await ready;
  const docs=workspace(), get=cached(docs,preview), {index}=buildMappingIndex(docs,get);
  const row=get(docs[0]).rows[0]; row.mappings=index.get(docs[0].doc).get(row.control);
  assert.equal(row.mappings.length,1);
  const html=renderControls('catalog',get(docs[0]),null,0,'','');
  assert.match(html,/Section \/ statement · a.s/); assert.match(html,/Control · b/); assert.match(html,/subset-of/);
  assert.match(html,/Target full statement &lt;script&gt;/); assert.ok(!html.includes('<script>'));
  assert.match(html,/<details class="mapping">/);
  const reverse=index.get(docs[1].doc).get(get(docs[1]).rows[0].control)[0];
  assert.equal(reverse.relationship,'superset-of');
});
test('keeps collective mappings together and rejects unsupported targets',async()=>{
  const [{preview},{buildMappingIndex,locateItem}] = await ready;
  const docs=workspace();const map=docs[2].doc['mapping-collection'].mappings[0].maps[0];
  map.sources.push({type:'control','id-ref':'a'});map.targets.push({type:'statement','id-ref':'b.s'});
  const get=cached(docs,preview), {index}=buildMappingIndex(docs,get);
  assert.equal(index.get(docs[0].doc).get(get(docs[0]).rows[0].control).length,1);
  assert.equal(locateItem(map.targets[1],get(docs[1]).rows).length,1);
  assert.equal(locateItem({type:'parameter','id-ref':'q'},get(docs[1]).rows).length,0);
});
test('matches document identity, not control IDs, and rebuilds after replacements',async()=>{
  const [{preview},{buildMappingIndex}] = await ready;
  const docs=workspace(); docs.push({name:'other.json',path:'root/other/a.json',doc:structuredClone(docs[0].doc)});
  let get=cached(docs,preview), result=buildMappingIndex(docs,get);
  assert.equal(result.index.has(docs[3].doc),false);
  docs[1]={...docs[1],doc:{catalog:{controls:[{id:'replacement',title:'New'}]}}};
  get=cached(docs,preview);result=buildMappingIndex(docs,get);
  assert.match(result.notices.get(docs[1].doc).join(' '),/cannot locate Control · b/);
});
test('missing resources remain visible and duplicate file names do not silently bind',async()=>{
  const [{preview},{buildMappingIndex}] = await ready;
  const docs=workspace();docs.splice(1,1);docs.push({name:'b.json',path:'root/wrong/b.json',doc:{catalog:{controls:[]}}});
  const get=cached(docs,preview),{index,notices}=buildMappingIndex(docs,get);
  assert.equal(index.get(docs[0].doc).get(get(docs[0]).rows[0].control)[0].other.rows,undefined);
  assert.match(notices.get(docs[0].doc).join(' '),/Missing JSON import/);
});
test('folder loader accepts mapping collections; profiles only receive direct references',async()=>{
  const [{preview},{buildMappingIndex},{readDocuments}] = await ready;
  const docs=workspace();const m=docs[2];
  const loaded=await readDocuments([{name:m.name,webkitRelativePath:m.path,size:100,text:async()=>JSON.stringify(m.doc)}],[],{folder:true});
  assert.equal(loaded.added,1);
  const p={name:'p.json',path:'root/profiles/p.json',doc:{profile:{imports:[{href:'../catalogs/a.json','include-all':{}}]}}};docs.push(p);
  let get=cached(docs,preview);assert.equal(buildMappingIndex(docs,get).index.has(p.doc),false);
  m.doc['mapping-collection'].mappings[0]['source-resource']={type:'profile',href:'../profiles/p.json'};
  get=cached(docs,preview);assert.equal(buildMappingIndex(docs,get).index.get(p.doc).size,1);
});
test('standard mapping schema accepts control/statement and flags parameter extension',async()=>{
  const [{makeValidator}] = await ready;
  const validate=makeValidator(require('../dist/ajv.js'),{'mapping-collection':require('../dist/oscal_mapping_schema.json')});
  const docs=workspace(), body=docs[2].doc['mapping-collection'];
  const uuid='4f431eaf-77a0-47bb-9aca-ae15496bf210';
  Object.assign(body,{uuid,metadata:{title:'Mapping','last-modified':'2026-09-15T00:00:00Z',version:'1','oscal-version':'1.2.3'},provenance:{method:'human','matching-rationale':'semantic',status:'draft','mapping-description':'Illustrative'}});
  body.mappings[0].uuid=uuid;body.mappings[0].maps[0].uuid=uuid;
  assert.deepEqual(validate(docs[2].doc),[]);
  body.mappings[0].maps[0].targets[0].type='parameter';
  assert.ok(validate(docs[2].doc).some(issue=>issue.severity==='error'));
});

test('schema-invalid collections cannot attach misleading mapping content',async()=>{
  const [{preview},{buildMappingIndex}] = await ready;
  const docs=workspace(),get=cached(docs,preview);
  const validate=()=>[{severity:'error',message:'invalid'}];
  const result=buildMappingIndex(docs,get,validate);
  assert.equal(result.index.size,0);
  assert.match(result.notices.get(docs[0].doc).join(' '),/schema errors; mappings are not displayed/);
});
