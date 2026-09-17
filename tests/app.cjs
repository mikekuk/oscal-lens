const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('workspace deletion refreshes profiles, mappings, selection and empty state',async()=>{
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)) elements.set(selector,{innerHTML:'',textContent:'',value:'',disabled:false,focus(){this.focused=true;},querySelectorAll:()=>[]});
    return elements.get(selector);
  };
  global.document={querySelector:element,querySelectorAll:()=>[]};
  global.window={ajv7:require('../dist/ajv.js')};
  global.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../dist',url),'utf8'))});
  try {
    await import('../dist/app.mjs');
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

  } finally {delete global.document;delete global.window;delete global.fetch;}
});
