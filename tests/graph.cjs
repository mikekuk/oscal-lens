const {test} = require('node:test');
const assert = require('node:assert/strict');
const ready = Promise.all([import('../dist/engine.mjs'), import('../dist/mappings.mjs'), import('../dist/graph-model.mjs')]);
function fixture() {
  const control = id => ({id, title:id, parts:[{id:id+'.s', name:'statement', parts:[{id:id+'.a',name:'item',prose:'Requirement'}]}]});
  const a = {name:'a.json',doc:{catalog:{controls:[control('a'), control('outlier')]}}};
  const b = {name:'b.json',doc:{catalog:{controls:[control('b')]}}};
  const map = {relationship:'subset-of',sources:[{type:'statement','id-ref':'a.a'},{type:'statement','id-ref':'a.s'}],targets:[{type:'statement','id-ref':'b.s'}]};
  const m = {name:'m.json',doc:{'mapping-collection':{mappings:[{'source-resource':{href:'a.json',type:'catalog'},'target-resource':{href:'b.json',type:'catalog'},maps:[map,structuredClone(map)]}]}}};
  return [a,b,m];
}
async function build(docs, validate) {
  const [{preview},{buildMappingIndex},{mappingGraph,projectGraph}] = await ready;
  const cache = new Map();
  const get = entry => {if (!cache.has(entry)) cache.set(entry,preview(entry.doc,docs)); return cache.get(entry);};
  return {graph:mappingGraph(docs,get,buildMappingIndex(docs,get,validate)), projectGraph};
}
test('counts distinct assertions, not reverse records or collective item combinations',async()=>{
  const {graph,projectGraph}=await build(fixture());
  const result=projectGraph(graph);
  assert.equal(result.controls,3); assert.equal(result.isolated,1);
  assert.deepEqual(result.components.map(c=>c.length).sort(),[1,2]);
  assert.equal(result.edges.length,1); assert.equal(result.edges[0].weight,2);
  assert.equal(result.nodes.find(n=>n.label==='a').degree,1);
});
test('expanding statements routes exact endpoints and collapses without inflation',async()=>{
  const {graph,projectGraph}=await build(fixture());
  const expanded=new Set(graph.nodes.filter(n=>n.label!=='outlier').map(n=>n.id));
  const result=projectGraph(graph,{expanded});
  const mappings=result.edges.filter(e=>e.kind==='mapping');
  assert.equal(mappings.length,2); assert.ok(mappings.every(e=>e.weight===2));
  assert.ok(mappings.every(e=>result.nodes.find(n=>n.id===e.source).kind==='statement'));
  assert.equal(projectGraph(graph).edges[0].weight,2);
});
test('file, resource and relationship filters recompute weights and outliers',async()=>{
  const docs=fixture(), second=structuredClone(docs[2]);second.name='second.json';docs.push(second);
  const {graph,projectGraph}=await build(docs);
  assert.equal(projectGraph(graph).edges[0].weight,4);
  assert.equal(projectGraph(graph,{files:new Set(['m.json'])}).edges[0].weight,2);
  assert.equal(projectGraph(graph,{relationships:new Set()}).isolated,3);
  assert.equal(projectGraph(graph,{resources:new Set(['a.json'])}).isolated,2);
  assert.equal(projectGraph(graph,{mode:'isolated'}).nodes[0].label,'outlier');
  assert.equal(projectGraph(graph,{mode:'component:0'}).controls,2);
});
test('profiles retain only existing mapped sections; no sideways inheritance',async()=>{
  const docs=fixture();docs.push({name:'p.json',doc:{profile:{imports:[{href:'a.json','include-all':{}}],modify:{alters:[{'control-id':'a',removes:[{'by-id':'a.a'},{'by-id':'a.s'}]}]}}}});
  const {graph,projectGraph}=await build(docs);
  const result=projectGraph(graph,{resources:new Set(['p.json','b.json'])});
  assert.equal(result.edges.length,0);
  assert.equal(result.controls,3);
});
test('invalid and unresolved mappings never create phantom connections',async()=>{
  const docs=fixture();docs.splice(1,1);
  let {graph,projectGraph}=await build(docs);
  assert.equal(projectGraph(graph).edges.length,0);assert.ok(graph.notices.length);
  ({graph,projectGraph}=await build(fixture(),doc=>doc['mapping-collection']?[{severity:'error'}]:[]));
  assert.equal(projectGraph(graph).edges.length,0);assert.ok(graph.notices.length);
});
test('negative relationships do not turn isolated controls into a cluster',async()=>{
  const docs=fixture();docs[2].doc['mapping-collection'].mappings[0].maps.forEach(m=>m.relationship='no-relationship');
  const {graph,projectGraph}=await build(docs);const result=projectGraph(graph);
  assert.equal(result.isolated,3);assert.equal(result.components.length,3);
});
test('same control IDs in different catalogues remain distinct and deletion rebuilds',async()=>{
  const docs=fixture();docs.push({name:'c.json',doc:structuredClone(docs[0].doc)});
  let {graph,projectGraph}=await build(docs);assert.equal(projectGraph(graph).controls,5);
  assert.equal(new Set(graph.nodes.map(n=>n.id)).size,5);
  docs.splice(2,1);({graph,projectGraph}=await build(docs));assert.equal(projectGraph(graph).edges.length,0);
});
test('bundled renderer lays out projected statements with finite positions',async()=>{
  const {default:cytoscape}=await import('../dist/vendor/cytoscape.mjs');
  const {graph,projectGraph}=await build(fixture());
  const projection=projectGraph(graph,{expanded:new Set([graph.nodes[0].id])});
  const cy=cytoscape({headless:true,elements:[...projection.nodes.map(n=>({data:{id:n.id}})),...projection.edges.map(e=>({data:{id:e.id,source:e.source,target:e.target,weight:e.weight}}))]});
  cy.layout({name:'cose',animate:false,numIter:50}).run();
  assert.ok(cy.nodes().every(n=>Number.isFinite(n.position('x'))&&Number.isFinite(n.position('y'))));
  assert.equal(cy.edges().length,projection.edges.length);cy.destroy();
});
test('anonymous sections expand safely without becoming mapping targets',async()=>{
  const docs=fixture();docs[0].doc.catalog.controls[0].parts.push({name:'guidance',prose:'No ID'});
  const {graph,projectGraph}=await build(docs);
  const result=projectGraph(graph,{expanded:new Set([graph.nodes[0].id])});
  assert.ok(result.nodes.some(n=>n.kind==='statement'&&n.label==='guidance'));
  assert.equal(new Set(result.nodes.map(n=>n.id)).size,result.nodes.length);
});
test('ambiguous section identifiers cannot crash graph expansion',async()=>{
  const docs=fixture();docs[0].doc.catalog.controls[0].parts.push({id:'a.s',name:'statement',prose:'Duplicate'});
  const {graph,projectGraph}=await build(docs);
  const result=projectGraph(graph,{expanded:new Set([graph.nodes[0].id])});
  assert.equal(new Set(result.nodes.map(n=>n.id)).size,result.nodes.length);
  assert.ok(graph.notices.some(n=>n.includes('ambiguous section IDs')));
});
