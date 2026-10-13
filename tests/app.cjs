const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('workspace deletion refreshes profiles, mappings, selection and empty state',async()=>{
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)) elements.set(selector,{innerHTML:'',textContent:'',value:'',disabled:false,setAttribute(){},focus(){this.focused=true;},querySelectorAll:()=>[]});
    return elements.get(selector);
  };
  global.document={querySelector:element,querySelectorAll:()=>[]};
  global.window={ajv7:require('../dist/ajv.js')};
  global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../dist',url),'utf8'))});
  try {
    await import('../dist/app.mjs');
    const details={open:true,dataset:{modelGroup:'profile'}};
    element('#documents').onclick({preventDefault(){},target:{closest:selector=>selector==='[data-model-group] > summary'?{parentElement:details}:null}});
    assert.equal(details.open,false);
    element('#search').oninput();
    assert.match(element('#documents').innerHTML,/data-model-group="profile">/);
    assert.match(element('#panel').innerHTML,/Mappings \(1\)/);
    assert.match(element('#panel').innerHTML,/gov-1_smt/);
    assert.match(element('#panel').innerHTML,/<span class="profile-change"[^>]*>every six months/);
    element('#documents').onclick({target:{closest:selector=>selector==='[data-doc]'?{dataset:{doc:'2'}}:null}});
    assert.match(element('#panel').innerHTML,/superset-of/);
    element('#section-options').onchange({target:{closest:()=>({dataset:{section:'mappings'},checked:false})}});
    assert.ok(!element('#panel').innerHTML.includes('<section class="control-section mappings">'));
    element('#documents').onclick({target:{closest:selector=>selector==='[data-doc]'?{dataset:{doc:'3'}}:null}});
    assert.match(element('#heading').innerHTML,/MAPPING COLLECTION/);
    assert.match(element('#heading').innerHTML,/Schema checks passed/);
    assert.match(element('#panel').innerHTML,/Mappings are added automatically/);

    const remove=index=>element('#documents').onclick({target:{closest:selector=>selector==='[data-remove-doc]'?{dataset:{removeDoc:String(index)}}:null}});
    const choose=index=>element('#documents').onclick({target:{closest:selector=>selector==='[data-doc]'?{dataset:{doc:String(index)}}:null}});
    const demo=()=>element('#demo').onclick();
    element('#section-options').onchange({target:{closest:()=>({dataset:{section:'mappings'},checked:true})}});
    demo();
    assert.match(element('#documents').innerHTML,/aria-label="Remove example-profile.json from workspace"/);
    assert.equal((element('#documents').innerHTML.match(/data-remove-doc=/g)||[]).length,4);
    remove(3); // Removing a mapping clears cached inherited mappings.
    assert.match(element('#doc-count').textContent,/3 files/);
    assert.doesNotMatch(element('#panel').innerHTML,/Mappings \(1\)/);
    assert.match(element('#heading').innerHTML,/PROFILE SELECTION PREVIEW/);

    demo();
    remove(2); // A missing mapping endpoint must lose its cached content.
    assert.match(element('#panel').innerHTML,/Missing JSON import: example-assurance.json/);
    assert.doesNotMatch(element('#panel').innerHTML,/Review the access policy at least annually and record approval/);
    demo();
    remove(1); // A missing catalogue invalidates the selected profile preview.
    assert.match(element('#panel').innerHTML,/Missing JSON import: example-catalog.json/);
    assert.doesNotMatch(element('#panel').innerHTML,/every six months/);
    const {exampleCatalog}=await import('../dist/examples.mjs');
    await element('#files').onchange({target:{files:[{name:'example-catalog.json',size:1,text:async()=>JSON.stringify(exampleCatalog)}],value:''}});
    assert.match(element('#panel').innerHTML,/every six months/);
    assert.match(element('#panel').innerHTML,/Mappings \(1\)/);

    demo();
    choose(2);
    remove(0); // Removing an earlier file preserves the selected document.
    assert.match(element('#panel').innerHTML,/superset-of/);
    assert.match(element('#documents').innerHTML,/class="doc active" data-doc="1"/);
    remove(1); // Removing the selection picks the next file.
    assert.match(element('#heading').innerHTML,/MAPPING COLLECTION/);
    remove(1); // Removing the final row picks the preceding file.
    assert.match(element('#heading').innerHTML,/CATALOGUE/);
    element('#search').value='stale query';
    remove(0);
    assert.equal(element('#doc-count').textContent,'0 files');
    for(const selector of ['#documents','#heading','#issue-count','#groups','#section-options']) assert.equal(element(selector).innerHTML,'');
    assert.equal(element('#search').value,'');
    assert.match(element('#panel').innerHTML,/No files loaded/);
    assert.equal(element('#files').focused,true);
    element('#search').oninput();
    assert.match(element('#panel').innerHTML,/No files loaded/);

    // A deletion during an asynchronous read must not be silently resurrected.
    demo();
    let finish;
    const pending=element('#files').onchange({target:{files:[{name:'extra.json',size:1,text:()=>new Promise(resolve=>{finish=resolve;})}],value:''}});
    assert.equal((element('#documents').innerHTML.match(/ disabled/g)||[]).length,4);
    remove(0);
    finish(JSON.stringify(exampleCatalog));
    await pending;
    assert.equal(element('#doc-count').textContent,'5 files');
    assert.doesNotMatch(element('#documents').innerHTML,/ disabled/);
    remove(4);
    assert.equal(element('#doc-count').textContent,'4 files');

    element('#implementation-demo').onclick();
    assert.equal(element('#doc-count').textContent,'6 files');
    assert.equal(element('#group-label').textContent,'GROUPS');
    assert.match(element('#groups').innerHTML,/data-group="ac-policy"/);
    assert.match(element('#heading').innerHTML,/SYSTEM SECURITY PLAN/);
    assert.match(element('#heading').innerHTML,/Schema checks passed/);
    assert.match(element('#panel').innerHTML,/The gateway enforces/);
    assert.match(element('#panel').innerHTML,/Mappings \(2\)/);
    assert.equal(element('#implementation-summary-tab').hidden,false);
    assert.equal(element('#components-tab').hidden,false);
    assert.doesNotMatch(element('#panel').innerHTML,/Defined component|ssp-control-status-group/);
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'components'}})}});
    assert.match(element('#panel').innerHTML,/<h3>Components<\/h3>/);
    assert.match(element('#panel').innerHTML,/Reporting service · Defined component · No implementation recorded/);
    assert.match(element('#panel').innerHTML,/Implementation recorded/);
    assert.doesNotMatch(element('#panel').innerHTML,/<details class="control/);
    assert.equal(element('#search').disabled,true);
    assert.equal(element('#control-settings').hidden,true);
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'controls'}})}});
    assert.equal(element('#search').disabled,false);
    assert.equal(element('#control-settings').hidden,false);
    element('#status-options').onchange({target:{value:'planned'}});
    assert.match(element('#panel').innerHTML,/1 control shown/);
    assert.match(element('#panel').innerHTML,/control ssp-status ssp-status-planned/);
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'implementation-summary'}})}});
    assert.match(element('#panel').innerHTML,/Implementation Summary/);
    assert.match(element('#panel').innerHTML,/6 controls/);
    assert.equal(element('#status-options').innerHTML,'');
    element('#panel').onclick({target:{closest:()=>({dataset:{summarySelect:'none'}})}});
    assert.match(element('#panel').innerHTML,/No controls in this component selection/);
    element('#panel').onchange({target:{closest:()=>({dataset:{summaryComponent:'3b77cd32-51ee-405e-a298-163d641519a1'},checked:true})}});
    assert.match(element('#panel').innerHTML,/Implementation status of 3 controls/);
    element('#panel').onclick({target:{closest:()=>({dataset:{summarySelect:'all'}})}});
    assert.match(element('#panel').innerHTML,/Implementation status of 6 controls/);
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'controls'}})}});
    assert.match(element('#panel').innerHTML,/1 control shown/);
    element('#status-options').onchange({target:{value:''}});
    element('#groups').onclick({target:{closest:()=>({dataset:{group:'au'}})}});
    assert.match(element('#panel').innerHTML,/1 control shown/);
    assert.match(element('#panel').innerHTML,/control ssp-status ssp-status-inherited/);
    element('#all-groups').onclick();
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'implementation-summary'}})}});
    element('.tabs').onclick({target:{closest:()=>({dataset:{tab:'components'}})}});
    choose(5);
    assert.equal(element('#components-tab').hidden,true);
    assert.equal(element('#group-label').textContent,'COMPONENTS');
    assert.equal(element('#implementation-summary-tab').hidden,true);
    assert.equal(element('#status-options').innerHTML,'');
    assert.match(element('#heading').innerHTML,/COMPONENT DEFINITION/);
    assert.match(element('#heading').innerHTML,/Schema checks passed/);
    assert.match(element('#panel').innerHTML,/Provides configurable access/);
    remove(0);
    assert.match(element('#panel').innerHTML,/Missing JSON import/);
    assert.match(element('#panel').innerHTML,/Provides configurable access/);
    assert.doesNotMatch(element('#panel').innerHTML,/Mappings \(2\)/);

  } finally {delete global.document;delete global.window;delete global.fetch;}
});
