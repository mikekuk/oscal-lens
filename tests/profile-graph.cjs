const {test} = require('node:test');
const assert = require('node:assert/strict');
function fixture(statement = false) {
  const catalog = name => ({name:name+'.json', doc:{catalog:{controls:[{id:name,title:name,parts:[{id:name+'.s',name:'statement',prose:'Requirement'}]}]}}});
  const profile = (name, source) => ({name:name+'.json',doc:{profile:{imports:[{href:source+'.json','include-all':{}}]}}});
  return [catalog('a'),catalog('b'),profile('pa','a'),profile('pb','b'),
    {name:'map.json',doc:{'mapping-collection':{mappings:[{
      'source-resource':{href:'a.json',type:'catalog'},'target-resource':{href:'b.json',type:'catalog'},
      maps:[{relationship:'subset-of',sources:[{type:statement?'statement':'control','id-ref':statement?'a.s':'a'}],
        targets:[{type:statement?'statement':'control','id-ref':statement?'b.s':'b'}]}]
    }]}}}];
}
async function graphFor(docs, selected, expand = false) {
  const {preview} = await import('../dist/engine.mjs');
  const {prepareGraph} = await import('../dist/graph-settings.mjs');
  const {mappingGraph,projectGraph} = await import('../dist/graph-model.mjs');
  const cache = new Map(), get = entry => {if (!cache.has(entry)) cache.set(entry,preview(entry.doc,docs));return cache.get(entry);};
  const prepared = prepareGraph(docs,get,undefined,{resources:new Set(selected.map(id=>id+'.json')),files:new Set(['map.json']),relationships:new Set(['subset-of'])});
  const graph = mappingGraph(prepared.documents,get,prepared.index);
  return projectGraph(graph,{expanded:expand?new Set(graph.nodes.map(n=>n.id)):new Set()});
}
test('two selected profiles from different catalogues inherit a directed mapping once',async()=>{
  const result=await graphFor(fixture(),['pa','pb']);
  assert.equal(result.edges.length,1);assert.equal(result.edges[0].weight,1);
  assert.equal(result.nodes.find(n=>n.id===result.edges[0].source).resource,'pa.json');
  assert.equal(result.nodes.find(n=>n.id===result.edges[0].target).resource,'pb.json');
  assert.equal(result.isolated,0);
});
test('both profile statement endpoints expand, without reverse count inflation',async()=>{
  const result=await graphFor(fixture(true),['pa','pb'],true), edges=result.edges.filter(e=>e.kind==='mapping');
  assert.equal(edges.length,1);assert.equal(edges[0].weight,1);
  for(const id of [edges[0].source,edges[0].target]) assert.equal(result.nodes.find(n=>n.id===id).kind,'statement');
});
test('removing either inherited statement or excluding a control removes its edge',async()=>{
  for(const i of [2,3]) {
    const docs=fixture(true), id=i===2?'a':'b';
    docs[i].doc.profile.modify={alters:[{'control-id':id,removes:[{'by-id':id+'.s'}]}]};
    assert.equal((await graphFor(docs,['pa','pb'])).edges.length,0);
  }
  const docs=fixture();docs[3].doc.profile.imports[0]['exclude-controls']=[{'with-ids':['b']}];
  assert.equal((await graphFor(docs,['pa','pb'])).edges.length,0);
});
test('nested profiles and multiple selected representations retain each pair once',async()=>{
  const docs=fixture();docs.push({name:'outer.json',doc:{profile:{imports:[{href:'pb.json','include-all':{}}]}}});
  const result=await graphFor(docs,['a','pa','b','pb','outer']);
  assert.equal(result.edges.length,6);assert.ok(result.edges.every(e=>e.weight===1));
});
test('matching IDs in unrelated catalogues or profiles do not receive inherited edges',async()=>{
  const docs=fixture();docs.push({name:'unrelated.json',doc:structuredClone(docs[1].doc)});
  docs.push({name:'unrelated-profile.json',doc:{profile:{imports:[{href:'unrelated.json','include-all':{}}]}}});
  assert.equal((await graphFor(docs,['pa','unrelated-profile'])).edges.length,0);
});
test('an explicit profile mapping reaches descendants but not sibling profiles',async()=>{
  const docs=fixture();const m=docs[4].doc['mapping-collection'].mappings[0];
  m['source-resource']={href:'pa.json',type:'profile'};m['target-resource']={href:'pb.json',type:'profile'};
  docs.push({name:'outer.json',doc:{profile:{imports:[{href:'pb.json','include-all':{}}]}}});
  docs.push({name:'sibling.json',doc:{profile:{imports:[{href:'b.json','include-all':{}}]}}});
  assert.equal((await graphFor(docs,['pa','outer'])).edges.length,1);
  assert.equal((await graphFor(docs,['pa','sibling'])).edges.length,0);
});
