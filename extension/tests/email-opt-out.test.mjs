import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DEFAULT_EMAILJS_CONFIG, buildOptOutEmail, discoverCurrentSite, findPageEmail, sendWithEmailJS} from '../email-opt-out.mjs';
import { privacyIssueCount } from '../sensitive-count.mjs';

test('review copy uses the current site and only names supplied fly categories for fly-analytics', () => {
  assert.equal(DEFAULT_EMAILJS_CONFIG.templateId, 'template_8566ppw');
  const fly = buildOptOutEmail('fly-analytics.fly.dev');
  assert.equal(fly.subject, 'Privacy request regarding fly-analytics.fly.dev');
  assert.match(fly.body, /appointments, biometrics, device_identifiers/);
  assert.match(fly.body, /I reserve all rights and remedies available to me/);
  const other = buildOptOutEmail('example.test');
  assert.match(other.body, /I am writing to example\.test/);
  assert.doesNotMatch(other.body, /Categories observed/);
});

test('EmailJS receives only the reviewed recipient, subject, and body', async () => {
  let request;
  await sendWithEmailJS({serviceId:'service_1',templateId:'template_1',publicKey:'public_1'},
    {to:'privacy@example.test',subject:'Review',body:'Please delete my data.'},
    async (url, options) => { request = {url, options}; return {ok:true}; });
  assert.equal(request.url, 'https://api.emailjs.com/api/v1.0/email/send');
  assert.deepEqual(JSON.parse(request.options.body).template_params,
    {to_email:'privacy@example.test',subject:'Review',message:'Please delete my data.'});
  await assert.rejects(sendWithEmailJS({}, {to:'x',subject:'x',body:'x'}), /Set up EmailJS/);
});

test('contact lookup checks a few obvious same-origin pages and keeps manual fallback', async () => {
  const current = {title:'Example',body:{textContent:''},querySelectorAll: selector => selector === 'a[href]'
    ? [{textContent:'Privacy policy',getAttribute:()=>'/privacy',href:'https://example.test/privacy'},
      {textContent:'Other',getAttribute:()=> 'https://other.test/contact',href:'https://other.test/contact'}] : []};
  const privacy = {body:{textContent:'Questions? privacy@example.test'},querySelectorAll:()=>[]};
  const result = await vm.runInNewContext(`(${findPageEmail.toString()})()`, {
    URL, location:{href:'https://example.test/'}, document:current, decodeURIComponent,
    AbortController, setTimeout, clearTimeout,
    DOMParser:class {parseFromString(){return privacy;}},
    fetch:async url=>({ok:true,url,headers:{get:()=> 'text/html'},text:async()=>'<html></html>'}),
  });
  assert.equal(result[0].email, 'privacy@example.test');
  assert.equal(result[0].source_url, 'https://example.test/privacy');
  assert.deepEqual(await discoverCurrentSite({tabs:{query:async()=>[{id:1,url:'https://example.test'}]},
    scripting:{executeScript:async()=>{throw Error('blocked');}}}), {host:'example.test',contacts:[]});
});

for (const host of ['fly-analytics.fly.dev', 'scriptwell.fly.dev', 'example.test']) {
test(`popup fixes the demo recipient for ${host} and only sends after review`, async () => {
  const nodes = new Map();
  const ids = ['closePopup','fileForMe','viewDetails','optOutDialog','recipientEmail','emailSubject','emailBody',
    'sendEmail','sendStatus','contactStatus','currentWebsite','emailjsService','emailjsTemplate',
    'emailjsPublicKey','cancelEmail','emailjsSetup','privacyOptOut','privacyStatus','packetCount'];
  for (const id of ids) nodes.set(id, {value:'',textContent:'',disabled:false,open:false,listeners:{},
    addEventListener(name, handler){this.listeners[name]=handler;},reportValidity(){return Boolean(this.value);},
    showModal(){this.open=true;},close(){this.open=false;this.listeners.close?.();}});
  const sent = [];
  let contactLookups = 0;
  const bodyClasses = new Set();
  vm.runInNewContext(fs.readFileSync(new URL('../popup.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/gm, ''), {
    privacyIssueCount,
    document:{getElementById:id=>nodes.get(id),addEventListener(){},body:{classList:{add:name=>bodyClasses.add(name),remove:name=>bodyClasses.delete(name)}}},window:{close(){},open(){}},URL,
    chrome:{tabs:{query:async()=>[{id:1,url:`https://${host}/`}],create(){}},
      storage:{local:{get:async()=>({emailjsConfig:{serviceId:'service_1',templateId:'template_1',publicKey:'public_1'}}),set:async()=>{}}},
      runtime:{getURL:path=>path}},
    DEFAULT_EMAILJS_CONFIG, buildOptOutEmail, discoverCurrentSite:async()=>{
      contactLookups += 1;
      return {host,contacts:[{email:'privacy@example.test',source_url:`https://${host}/privacy`}]};
    },
    sendWithEmailJS:async (...args)=>{sent.push(args);},
    fetch:async()=>({ok:true,json:async()=>({events:[]})}),
  });
  await nodes.get('privacyOptOut').listeners.click();
  assert.equal(nodes.get('optOutDialog').open,true);
  assert.equal(bodyClasses.has('review-open'),true);
  assert.match(nodes.get('contactStatus').textContent,/Hackathon demo/);
  assert.equal(nodes.get('recipientEmail').value,'scriptwellcontact@gmail.com');
  assert.equal(nodes.get('recipientEmail').readOnly,true);
  assert.equal(contactLookups,0);
  assert.equal(nodes.get('emailSubject').value,buildOptOutEmail(host).subject);
  assert.equal(nodes.get('emailBody').value,buildOptOutEmail(host).body);
  assert.equal(sent.length,0);
  // Even a programmatic change must not override the demo send destination.
  nodes.get('recipientEmail').value='privacy@example.test';
  nodes.get('emailSubject').value='Reviewed subject';
  nodes.get('emailBody').value='Reviewed body';
  await nodes.get('sendEmail').listeners.click();
  assert.equal(sent.length,1);
  assert.equal(nodes.get('recipientEmail').value,'scriptwellcontact@gmail.com');
  assert.deepEqual({...sent[0][1]}, {
    to:'scriptwellcontact@gmail.com',subject:'Reviewed subject',body:'Reviewed body',
  });
  assert.equal(nodes.get('sendEmail').textContent,'Sent ✓');
});
}
