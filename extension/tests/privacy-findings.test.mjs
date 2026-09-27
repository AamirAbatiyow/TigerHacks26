import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadPrivacyFindings, pageContacts, discoverPageContacts} from '../privacy-findings.mjs';
const finding={event_id:'evt-1',company:'Example Health',reason_label:'Sensitive data observed',status:'UNSUPPORTED'};

test('finding loader validates local API input',async()=>{
  let url;
  assert.deepEqual(await loadPrivacyFindings(async u=>{url=u;return {ok:true,json:async()=>({findings:[finding]})};}),[finding]);
  assert.equal(url,'http://127.0.0.1:8765/api/privacy/findings');
  await assert.rejects(loadPrivacyFindings(async()=>({ok:true,json:async()=>({findings:[finding,finding]})})),/Invalid/);
});
test('page discovery uses published mailto contacts, strips URL query, and ignores form values',()=>{
  const links=[['mailto:contact%2Bprivacy@example.test','Privacy contact'],['mailto:person@example.test','Profile'],['mailto:a@example.test,b@example.test','Contact']];
  const result=vm.runInNewContext(`(${pageContacts.toString()})()`,{URL,decodeURIComponent,location:{href:'https://example.test/privacy?secret=x#fragment'},document:{title:'Example',querySelectorAll:()=>links.map(([href,text])=>({textContent:text,parentElement:{textContent:text},getAttribute:()=>href}))}});
  assert.equal(result.length,1);assert.equal(result[0].email,'contact+privacy@example.test');assert.equal(result[0].source_url,'https://example.test/privacy');
});
test('restricted browser pages still permit the manual-recipient path',async()=>{
  assert.deepEqual(await discoverPageContacts({tabs:{query:async()=>[{id:1}]},scripting:{executeScript:async()=>{throw new Error('restricted');}}}),[]);
});
