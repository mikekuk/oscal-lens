const {test} = require('node:test');
const assert = require('node:assert/strict');
const ready = import('../dist/graph-settings.mjs');
function fixture() {
  const a = {name:'a.json',doc:{catalog:{controls:[{id:'a',title:'A'}]}}};
  const b = {name:'b.json',doc:{catalog:{controls:[{id:'b',title:'B'}]}}};
  const c = {name:'large-unselected.json',doc:{catalog:{controls:[]}}};
  const m = {name:'m.json',doc:{'mapping-collection':{mappings:[
    {'source-resource':{href:'a.json',type:'catalog'},'target-resource':{href:'b.json',type:'catalog'},maps:[{relationship:'equal-to',sources:[{type:'control','id-ref':'a'}],targets:[{type:'control','id-ref':'b'}]}]},
    {'source-resource':{href:'large-unselected.json',type:'catalog'},'target-resource':{href:'b.json',type:'catalog'},maps:[]}
  ]}}};
  return [a,b,c,m];
}
function panel() {
  const elements = new Map();
  return {innerHTML:'',querySelector(selector){if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',disabled:false});return elements.get(selector);}};
}
function toggle(p, kind, index, checked) {
  p.querySelector('.graph-filters').onchange({target:{closest:()=>({dataset:{filter:kind,index},checked})}});
}
test('graph form starts empty and never loads renderer or previews before OK',async()=>{
  const {createGraphState,mountGraphSettings}=await ready;
  const p=panel(), state=createGraphState();let loads=0, reads=0, mounts=0;
  const docs=fixture();const {preview}=await import('../dist/engine.mjs');const cache=new Map();
  const get=e=>{reads++;if(!cache.has(e))cache.set(e,preview(e.doc,docs));return cache.get(e);};
  const dispose=mountGraphSettings(p,docs,get,undefined,state,async()=>{loads++;return {mountGraph(){mounts++;return ()=>{};}};});
  assert.equal(state.selectedResources.size,0);assert.equal(reads,0);assert.equal(loads,0);
  await p.querySelector('[data-build-graph]').onclick();assert.equal(loads,0);
  toggle(p,'resources',0,true);toggle(p,'resources',1,true);
  assert.equal(reads,0);assert.equal(loads,0);
  await p.querySelector('[data-build-graph]').onclick();assert.equal(loads,1);assert.equal(mounts,1);
  const before=reads;toggle(p,'resources',1,false);assert.equal(reads,before);assert.equal(mounts,1);
  dispose();
});
test('scope skips previews for unselected catalogues and retains selected mappings',async()=>{
  const {prepareGraph}=await ready, {preview}=await import('../dist/engine.mjs');
  const docs=fixture(), reads=new Set(), cache=new Map();
  const get=e=>{reads.add(e.name);assert.notEqual(e.name,'large-unselected.json');if(!cache.has(e))cache.set(e,preview(e.doc,docs));return cache.get(e);};
  const result=prepareGraph(docs,get,undefined,{resources:new Set(['a.json','b.json']),files:new Set(['m.json']),relationships:new Set(['equal-to'])});
  assert.deepEqual(result.documents.map(e=>e.name),['a.json','b.json','m.json']);
  assert.equal(result.index.index.size,2);assert.equal(reads.has('large-unselected.json'),false);
});
test('selected profiles retain inherited catalogue mappings',async()=>{
  const {prepareGraph}=await ready, {preview}=await import('../dist/engine.mjs'), {mappingGraph,projectGraph}=await import('../dist/graph-model.mjs');
  const docs=fixture();docs.push({name:'p.json',doc:{profile:{imports:[{href:'a.json','include-all':{}}]}}});
  const cache=new Map(),get=e=>{if(!cache.has(e))cache.set(e,preview(e.doc,docs));return cache.get(e);};
  const prepared=prepareGraph(docs,get,undefined,{resources:new Set(['p.json','b.json']),files:new Set(['m.json']),relationships:new Set(['equal-to'])});
  assert.equal(projectGraph(mappingGraph(prepared.documents,get,prepared.index)).edges.length,1);
});
test('leaving graph tab cancels pending lazy load without building',async()=>{
  const {mountGraphSettings,createGraphState}=await ready;const p=panel();let resolve, mounts=0;
  const dispose=mountGraphSettings(p,fixture(),()=>{throw Error('must not preview');},undefined,createGraphState(),()=>new Promise(r=>resolve=r));
  toggle(p,'resources',0,true);const pending=p.querySelector('[data-build-graph]').onclick();dispose();
  resolve({mountGraph(){mounts++;}});await pending;assert.equal(mounts,0);
});
test('changing draft filters cancels pending build; empty OK clears previous renderer',async()=>{
  const {mountGraphSettings,createGraphState}=await ready;const p=panel();let resolve, mounts=0, disposals=0;
  const docs=fixture(), {preview}=await import('../dist/engine.mjs');
  mountGraphSettings(p,docs,e=>preview(e.doc,docs),undefined,createGraphState(),()=>new Promise(r=>resolve=r));
  toggle(p,'resources',0,true);let pending=p.querySelector('[data-build-graph]').onclick();
  toggle(p,'resources',1,true);resolve({mountGraph(){mounts++;}});await pending;assert.equal(mounts,0);
  pending=p.querySelector('[data-build-graph]').onclick();resolve({mountGraph(){mounts++;return ()=>disposals++;}});await pending;
  assert.equal(mounts,1);toggle(p,'resources',0,false);toggle(p,'resources',1,false);
  await p.querySelector('[data-build-graph]').onclick();assert.equal(disposals,1);assert.equal(p.querySelector('[data-graph-result]').innerHTML,'');
});
