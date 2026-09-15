const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('application startup, document switching and mapping toggle use the workspace index',async()=>{
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)) elements.set(selector,{innerHTML:'',textContent:'',value:'',disabled:false,querySelectorAll:()=>[]});
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
    element('#documents').onclick({target:{closest:()=>({dataset:{doc:'2'}})}});
    assert.match(element('#panel').innerHTML,/superset-of/);
    element('#section-options').onchange({target:{closest:()=>({dataset:{section:'mappings'},checked:false})}});
    assert.ok(!element('#panel').innerHTML.includes('<section class="control-section mappings">'));
    element('#documents').onclick({target:{closest:()=>({dataset:{doc:'3'}})}});
    assert.match(element('#heading').innerHTML,/MAPPING COLLECTION/);
    assert.match(element('#heading').innerHTML,/Schema checks passed/);
    assert.match(element('#panel').innerHTML,/Mappings are added automatically/);
  } finally {delete global.document;delete global.window;delete global.fetch;}
});
