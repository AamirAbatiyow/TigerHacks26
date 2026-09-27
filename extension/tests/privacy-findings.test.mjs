import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadPrivacyFindings, pageContacts, discoverPageContacts} from '../privacy-findings.mjs';
const finding={event_id:'evt-1',company:'Example Health',reason_label:'Sensitive data observed',status:'UNSUPPORTED'};
const flush=()=>new Promise(setImmediate);
function popup(initial=[finding]) {
  const nodes=new Map(); const opened=[]; const drafted=[]; const listeners={}; let data=initial; let closed=false;
  for (const id of ['packetCount','closePopup','viewDetails','privacyOptOut','privacyOptOutLabel','privacyFinding','privacyReason','privacyStatus','refreshPrivacyFindings']) nodes.set(id,{
    value:'',disabled:false,textContent:'',listeners:{},addEventListener(e,f){this.listeners[e]=f;},setAttribute(k,v){this[k]=v;},replaceChildren(){this.value='';},add(){}
  });
  vm.runInNewContext(fs.readFileSync(new URL('../popup.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,''),{
    loadPrivacyFindings:async()=>{if(data instanceof Error) throw data;return typeof data==='function'?data():data;},
    createPrivacyDraft:async p=>{drafted.push(p);return {draft_id:'local-draft'};},discoverPageContacts:async()=>[], encodeURIComponent,
    fetch:async()=>({ok:true,json:async()=>({events:[]})}),Option:class{},
    document:{getElementById:id=>nodes.get(id),addEventListener:(e,f)=>{listeners[e]=f;}},
    window:{close:()=>{closed=true;},open:url=>opened.push(url)},
    chrome:{runtime:{getURL:path=>path},tabs:{create:({url})=>opened.push(url)}},
  });
  return {nodes,opened,drafted,listeners,get closed(){return closed;},setData:v=>{data=v;}};
}

test('finding loader validates local API input',async()=>{
  let url;
  assert.deepEqual(await loadPrivacyFindings(async u=>{url=u;return {ok:true,json:async()=>({findings:[finding]})};}),[finding]);
  assert.equal(url,'http://127.0.0.1:8765/api/privacy/findings');
  await assert.rejects(loadPrivacyFindings(async()=>({ok:true,json:async()=>({findings:[finding,finding]})})),/Invalid/);
});
test('one action opens local review even without a verified strategy; nothing sends automatically',async()=>{
  const ui=popup();await flush();
  assert.equal(ui.nodes.get('privacyOptOutLabel').textContent,'Take Privacy Action');
  assert.equal(ui.nodes.get('privacyOptOut').disabled,false);
  assert.equal(ui.drafted.length,0);assert.equal(ui.opened.length,0);
  await ui.nodes.get('privacyOptOut').listeners.click();
  assert.equal(ui.drafted[0].event_id,'evt-1');
  assert.deepEqual(ui.opened,['visualization/index.html?privacy&action=local-draft']);
});
test('removed findings, unavailable service, or a changed selection do not open an old draft',async()=>{
  for(const next of [[],new Error('offline')]){
    const ui=popup();await flush();ui.setData(next);await ui.nodes.get('privacyOptOut').listeners.click();assert.equal(ui.opened.length,0);
  }
  const ui=popup();await flush();let resolve;ui.setData(()=>new Promise(r=>{resolve=r;}));
  const click=ui.nodes.get('privacyOptOut').listeners.click();ui.nodes.get('privacyFinding').value='different';ui.nodes.get('privacyFinding').listeners.change();resolve([finding]);await click;
  assert.equal(ui.opened.length,0);
});
test('report, close, Escape remain; popup has a single consolidated privacy action',async()=>{
  const ui=popup();await flush();ui.nodes.get('viewDetails').listeners.click();assert.deepEqual(ui.opened,['visualization/index.html']);
  ui.listeners.keydown({key:'Escape'});assert.equal(ui.closed,true);
  const html=fs.readFileSync(new URL('../popup.html',import.meta.url),'utf8');assert.equal((html.match(/id="privacyOptOut"/g)||[]).length,1);assert.doesNotMatch(html,/fileForMe|Limit sensitive data/);
});
test('page discovery uses published mailto contacts, strips URL query, and ignores form values',()=>{
  const links=[['mailto:contact%2Bprivacy@example.test','Privacy contact'],['mailto:person@example.test','Profile'],['mailto:a@example.test,b@example.test','Contact']];
  const result=vm.runInNewContext(`(${pageContacts.toString()})()`,{URL,decodeURIComponent,location:{href:'https://example.test/privacy?secret=x#fragment'},document:{title:'Example',querySelectorAll:()=>links.map(([href,text])=>({textContent:text,parentElement:{textContent:text},getAttribute:()=>href}))}});
  assert.equal(result.length,1);assert.equal(result[0].email,'contact+privacy@example.test');assert.equal(result[0].source_url,'https://example.test/privacy');
});
test('restricted browser pages still permit the manual-recipient path',async()=>{
  assert.deepEqual(await discoverPageContacts({tabs:{query:async()=>[{id:1}]},scripting:{executeScript:async()=>{throw new Error('restricted');}}}),[]);
});
