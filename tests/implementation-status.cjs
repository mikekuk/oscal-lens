const {test} = require('node:test');
const assert = require('node:assert/strict');
const ready = Promise.all([import('../dist/implementation-status.mjs'), import('../dist/views.mjs'), import('../dist/engine.mjs'), import('../dist/examples.mjs')]);
const status = state => ({'implementation-status': {state}});
const contribution = (id, state) => ({'component-uuid': id, description: id + ' narrative', ...status(state)});
const property = (name, value, ns) => ({name, value, ...(ns ? {ns} : {})});

test('SSP status rollups distinguish planned, partial, complete, N/A and fully inherited', async()=>{
  const [{rollupStatus}] = await ready;
  const cases = [
    [[], 'unspecified'], [['implemented'], 'implemented'], [['partial'], 'partial'],
    [['alternative'], 'alternative'], [['alternative','alternative'], 'alternative'],
    [['alternative','implemented','inherited','not-applicable'],'alternative'],
    [['alternative','partial'],'partial'], [['alternative','planned'],'partial'],
    [['alternative','unspecified'],'unspecified'], [['other'],'other'],
    [['other','implemented','alternative'],'other'], [['other','partial'],'partial'],
    [['other','planned'],'partial'], [['other','unspecified'],'unspecified'],
    [['planned'], 'planned'], [['not-applicable'], 'not-applicable'], [['inherited'], 'inherited'],
    [['implemented','inherited','not-applicable'],'implemented'],
    [['inherited','inherited','not-applicable'],'inherited'],
    [['not-applicable','not-applicable'],'not-applicable'],
    [['planned','planned','not-applicable'],'planned'],
    [['implemented','planned'],'partial'], [['inherited','planned'],'partial'],
    [['partial','planned'],'partial'], [['partial','not-applicable'],'partial'],
    [['implemented','unspecified'],'unspecified'], [['inherited','unspecified'],'unspecified'],
    [['planned','unspecified'],'partial'], [['unspecified','not-applicable'],'unspecified']
  ];
  for (const [states, expected] of cases) {
    assert.equal(rollupStatus(states), expected, states.join(','));
    assert.equal(rollupStatus([...states].reverse()), expected, 'order independence');
  }
});
test('reads native and scoped OSCAL/FedRAMP properties without confusing operational or mapping status', async()=>{
  const [{declaredStatus}] = await ready;
  assert.equal(declaredStatus(status('implemented')), 'implemented');
  for (const ns of [undefined,'http://csrc.nist.gov/ns/oscal','https://fedramp.gov/ns/oscal']) {
    assert.equal(declaredStatus({props:[property('implementation-status','partial',ns)]}), 'partial');
    assert.equal(declaredStatus({props:[property('control-origination','inherited',ns)]}), 'inherited');
  }
  assert.equal(declaredStatus({props:[property('implementation-status','N/A')]}), 'not-applicable');
  assert.equal(declaredStatus({...status('planned'),props:[property('implementation-status','implemented'),property('control-origination','inherited')]}), 'planned');
  assert.equal(declaredStatus({...status('implemented'),props:[property('control-origination','inherited')]}), 'inherited');
  for (const value of [status(''),status(null),status(42),{status:{state:'operational'}},{inherited:[{description:'Some inherited responsibility'}]}, {lineage:[{}]}, {props:[property('implementation-status','implemented','https://unrelated.example')]}]) {
    assert.equal(declaredStatus(value), 'unspecified');
  }
  assert.equal(declaredStatus(status('alternative'),'implemented'), 'alternative');
  assert.equal(declaredStatus(status('locally-defined')), 'other');
  assert.equal(declaredStatus({...status('alternative'),props:[property('control-origination','inherited')]}), 'alternative');
  for(const ns of [undefined,'http://csrc.nist.gov/ns/oscal','https://fedramp.gov/ns/oscal']) {
    assert.equal(declaredStatus({props:[property('implementation-status','alternative',ns)]}), 'alternative');
    assert.equal(declaredStatus({props:[property('implementation-status','custom-state',ns)]}), 'other');
  }
});
test('section rollups override aggregate claims and inherit only missing status declarations', async()=>{
  const [{nodeStatus}] = await ready;
  const body = {props:[property('implementation-status','implemented')],statements:[
    {'statement-id':'one','by-components':[contribution('a','inherited')]},
    {'statement-id':'two','by-components':[contribution('a','planned')]}
  ]};
  assert.equal(nodeStatus(body),'partial');
  delete body.statements[1]['by-components'][0]['implementation-status'];
  assert.equal(nodeStatus(body),'implemented');
  delete body.props;
  assert.equal(nodeStatus(body),'unspecified');
  body.statements[1]['by-components'][0]['implementation-status']={state:'not-applicable'};
  assert.equal(nodeStatus(body),'inherited');
});
function mixedResult() {
  return {sources:[],notes:[],components:[{id:'a',title:'Local service',defined:true,implemented:true,body:{}},{id:'b',title:'External service',defined:true,implemented:true,body:{}}], rows:[{
    control:{id:'ac-1',title:'Access'},groups:[{id:'g',title:'Access group'}],parents:[],parameters:{}, componentIds:['a','b'],
    implementations:[{componentIds:['a','b'],body:{statements:[
      {'statement-id':'ac-1.a','by-components':[contribution('a','implemented'),contribution('b','inherited')]},
      {'statement-id':'ac-1.b','by-components':[contribution('a','planned'),contribution('b','not-applicable')]}
    ]}}]
  }]};
}
test('component scope recomputes the control colour and preserves individual section colours', async()=>{
  const [{controlStatus},{renderControls}] = await ready;
  const result=mixedResult(), before=JSON.stringify(result);
  assert.equal(controlStatus(result.rows[0]),'partial');
  assert.equal(controlStatus(result.rows[0],'a'),'partial');
  assert.equal(controlStatus(result.rows[0],'b'),'inherited');
  const all=renderControls('system-security-plan',result,null,0,'','');
  assert.match(all,/<details class="control ssp-status ssp-status-partial"/);
  for(const state of ['implemented','planned','inherited','not-applicable']) assert.match(all,new RegExp('<div class="part ssp-status ssp-status-'+state+'">'));
  const grouped=renderControls('system-security-plan',result,null,0,'g','');
  assert.match(grouped,/<details class="control ssp-status ssp-status-partial"/);
  assert.match(grouped,/a narrative/);
  assert.match(grouped,/b narrative/);
  assert.equal(JSON.stringify(result),before);
});
test('unrecorded controls stay unspecified; non-SSP views do not receive SSP colour classes', async()=>{
  const [,{renderControls}] = await ready;
  const result=mixedResult(); result.rows[0].implementations=[];
  assert.match(renderControls('system-security-plan',result,null,0,'',''),/<details class="control ssp-status ssp-status-unspecified"/);
  for (const type of ['catalog','profile','component-definition']) assert.doesNotMatch(renderControls(type,result,null,0,'',''),/ssp-status/);
});
test('SSP preview colours reflect explicit contributions, not inherited profile mappings', async()=>{
  const [{controlStatus},{renderControls},{preview},examples] = await ready;
  const ssp=structuredClone(examples.exampleSSP);
  const docs=[{name:'example-ssp.json',doc:ssp},{name:'example-profile.json',doc:examples.exampleProfile},{name:'example-catalog.json',doc:examples.exampleCatalog}];
  const body=ssp['system-security-plan']['control-implementation']['implemented-requirements'][0];
  body['by-components'][0]['implementation-status']={state:'implemented'};
  body.statements[0]['by-components'][0]['implementation-status']={state:'implemented'};
  let result=preview(ssp,docs);
  assert.equal(controlStatus(result.rows.find(row=>row.control.id==='ac-1')),'implemented');
  assert.equal(controlStatus(result.rows.find(row=>row.control.id==='ac-2')),'unspecified');
  body.statements[0]['by-components'][0]['implementation-status']={state:'planned'};
  result=preview(ssp,docs);
  assert.match(renderControls('system-security-plan',result,null,0,'',''),/<details class="control ssp-status ssp-status-partial"/);
});
test('status filter combines with profile group and text filters and never changes the underlying rows', async()=>{
  const [,{renderControls}] = await ready;
  const result=mixedResult();
  const render=(group,query,state)=>renderControls('system-security-plan',result,null,0,group,query,{},state);
  assert.match(render('','','partial'),/1 control shown/);
  assert.match(render('','','implemented'),/0 controls shown/);
  assert.match(render('g','','partial'),/1 control shown/);
  assert.match(render('g','no-match','partial'),/0 controls shown/);
  assert.match(render('g','','inherited'),/0 controls shown/);
  assert.equal(result.rows.length,1);
});
test('summary counts each control once and reclassifies multi-component selections', async()=>{
  const [{summariseImplementation},,,{implementationExampleWorkspace}] = await ready;
  const {preview,makeValidator} = (await ready)[2];
  const docs=implementationExampleWorkspace(), result=preview(docs[4].doc,docs);
  const validate=makeValidator(require('../dist/ajv.js'),Object.fromEntries(require('../dist/schemas/manifest.json').map(item=>[`${item.type}@${item.version}`,require('../dist/'+item.path)])));
  for(const entry of docs) assert.deepEqual(validate(entry.doc),[],entry.name);
  const all=summariseImplementation(result);
  assert.equal(all.total,7); assert.equal(all.selected.size,3);
  for(const [state,rows] of Object.entries(all.groups)) assert.equal(rows.length,state==='other'?0:1);
  const provider=result.components.find(component=>component.title==='Shared identity provider');
  const excluded=new Set(result.components.filter(component=>component!==provider).map(component=>component.id));
  const one=summariseImplementation(result,excluded);
  assert.equal(one.total,3); assert.equal(one.groups.inherited.length,3);
  assert.equal(summariseImplementation(result,new Set(result.components.map(c=>c.id))).total,0);
});
test('summary renders accessible pie, counts and grouped lists, including full and empty circles', async()=>{
  const {renderImplementationSummary}=await import('../dist/implementation-summary.mjs');
  const result=mixedResult();
  let html=renderImplementationSummary(result);
  assert.match(html,/Implementation Summary/); assert.match(html,/role="img"/);
  assert.match(html,/<circle /); assert.doesNotMatch(html,/NaN|Infinity/);
  assert.equal((html.match(/data-summary-component="[^"]+" checked/g)||[]).length,2);
  assert.match(html,/<li><strong>ac-1<\/strong> Access/);
  assert.equal((html.match(/<details class="summary-status-group/g)||[]).length,8);
  assert.equal((html.match(/<summary><span class="ssp-status-badge/g)||[]).length,8);
  const empty=renderImplementationSummary(result,new Set(['a','b']));
  assert.match(empty,/No controls in this component selection/); assert.doesNotMatch(empty,/<svg/);
  const rows=structuredClone(result.rows); rows[0].control={id:'x',title:'<script>unsafe</script>'};
  rows[0].implementations[0].body={'by-components':[contribution('a','implemented')]};
  html=renderImplementationSummary({...result,rows:[...result.rows,...rows]});
  assert.equal((html.match(/<path /g)||[]).length,2);
  assert.match(html,/&lt;script&gt;unsafe/); assert.doesNotMatch(html,/<script>/);
});
test('SSP Controls preserves profile order and group filtering with full status colours', async()=>{
  const [{controlStatus},{renderControls,renderGroups},{preview},{implementationExampleWorkspace}]=await ready;
  const docs=implementationExampleWorkspace(), result=preview(docs[4].doc,docs);
  const controlIds=html=>[...html.matchAll(/<details class="control ssp-status ssp-status-[^"]+"[^>]*>\s*<summary><span class="id">([^<]+)/g)].map(match=>match[1]);
  const html=renderControls('system-security-plan',result,null,0,'','');
  assert.deepEqual(controlIds(html),result.rows.map(row=>row.control.id));
  assert.doesNotMatch(html,/ssp-control-status-group|Defined component|Undefined component/);
  for(const row of result.rows) assert.ok(html.includes(`class="control ssp-status ssp-status-${controlStatus(row)}"`));
  const navigation=renderGroups(result.sources,result,'',false);
  for(const id of ['ac','ac-policy','au']) {
    assert.ok(navigation.includes(`data-group="${id}"`));
    const filtered=renderControls('system-security-plan',result,null,0,id,'');
    assert.deepEqual(controlIds(filtered),result.rows.filter(row=>row.groups.some(group=>group.id===id)).map(row=>row.control.id));
    assert.match(filtered,/Filtered by group/);
  }
  for(const component of result.components) assert.ok(!navigation.includes(`data-group="${component.id}"`));
});

test('every predefined SSP implementation state in the bundled schemas has the OSCAL label and a colour', async()=>{
  const [{statusLabels,declaredStatus}]=await ready;
  const fs=require('node:fs');
  const css=fs.readFileSync(require('node:path').join(__dirname,'../dist/styles.css'),'utf8');
  const expected={implemented:'Implemented',partial:'Partial',planned:'Planned',alternative:'Alternative','not-applicable':'Not applicable'};
  let checked=0;
  for(const entry of require('../dist/schemas/manifest.json').filter(entry=>entry.type==='system-security-plan')) {
    const schema=require('../dist/'+entry.path);
    for(const [key,definition] of Object.entries(schema.definitions)) {
      if(!key.endsWith(':implementation-status')) continue;
      const constraints=definition.properties.state.anyOf || definition.properties.state.allOf || [];
      const states=constraints.find(item=>item.enum)?.enum;
      if(!states) continue;
      assert.deepEqual([...states].sort(),Object.keys(expected).sort(),entry.version);
      for(const state of states) {
        assert.equal(declaredStatus(status(state)),state);
        assert.equal(statusLabels[state],expected[state]);
        assert.ok(css.includes('.ssp-status-'+state+' {'));
      }
      checked++;
    }
  }
  assert.ok(checked>0);
});
test('alternative and locally defined statuses retain colours, filters, raw details and summary slices', async()=>{
  const [{controlStatus},{renderControls,renderStatusFilter}]=await ready;
  const {renderImplementationSummary}=await import('../dist/implementation-summary.mjs');
  const result=mixedResult(), row=result.rows[0];
  row.implementations[0].body={'by-components':[contribution('a','alternative'),contribution('b','implemented')]};
  assert.equal(controlStatus(row),'alternative');
  let html=renderControls('system-security-plan',result,null,0,'','',{},'alternative');
  assert.match(html,/1 control shown/);
  assert.match(html,/class="control ssp-status ssp-status-alternative"/);
  assert.match(html,/class="part ssp-status ssp-status-alternative"/);
  assert.doesNotMatch(html,/<details class="control[^>]*\bopen\b/);
  assert.match(renderStatusFilter(),/<option value="alternative">Alternative/);
  assert.match(renderStatusFilter(),/<option value="not-applicable">Not applicable/);
  html=renderImplementationSummary(result);
  assert.match(html,/summary-slice ssp-status-alternative/);
  assert.match(html,/Alternative: 1 \(100%\)/);
  html=renderImplementationSummary(result,new Set(['a']));
  assert.match(html,/summary-slice ssp-status-implemented/);
  row.implementations[0].body['by-components'][0]['implementation-status'].state='custom-<script>';
  html=renderControls('system-security-plan',result,null,0,'','',{},'other');
  assert.match(html,/1 control shown/);
  assert.match(html,/ssp-status-other/);
  assert.match(html,/custom-&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(renderImplementationSummary(result),/summary-slice ssp-status-other/);
});
test('controls start collapsed for every document type and filtered view', async()=>{
  const [,{renderControls}]=await ready;
  for(const type of ['catalog','profile','system-security-plan','component-definition']) {
    for(const group of ['',type==='component-definition'?'a':'g']) {
      const html=renderControls(type,mixedResult(),null,0,group,'');
      assert.match(html,/<details class="control/);
      assert.doesNotMatch(html,/<details class="control[^>]*\bopen\b/);
    }
  }
});
