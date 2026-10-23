import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createApp} from '../src/app.js';
const body=JSON.parse(await readFile(new URL('../examples/v2.json',import.meta.url)));
const payTo='0x1111111111111111111111111111111111111111';
const network='eip155:84532';
async function serve(t,app){const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}`;}
const post=(url,data=body,headers={})=>fetch(url+'/estimate',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
function facilitator({valid=false,settles=true}={}){return {
 calls:{verify:0,settle:0},
 async getSupported(){return {kinds:[{x402Version:2,scheme:'exact',network}],extensions:[],signers:{}};},
 async verify(){this.calls.verify++;return {isValid:valid,invalidReason:valid?undefined:'invalid_signature',payer:payTo};},
 async settle(){this.calls.settle++;return {success:settles,transaction:settles?'0x'+'a'.repeat(64):'',network,errorReason:settles?undefined:'settlement_failed'};}
};}
async function signedHeader(url){const r=await post(url);const requirements=JSON.parse(Buffer.from(r.headers.get('payment-required'),'base64').toString());return Buffer.from(JSON.stringify({x402Version:2,accepted:requirements.accepts[0],payload:{signature:'0x'+'0'.repeat(130),authorization:{from:payTo,to:payTo,value:'10000',validAfter:'0',validBefore:'9999999999',nonce:'0x'+'0'.repeat(64)}}})).toString('base64');}
test('Local development works and validates before execution',async t=>{const u=await serve(t,await createApp({localOnly:true}));assert.equal((await fetch(u+'/health')).status,200);assert.equal((await post(u)).status,200);assert.equal((await post(u,{...body,window_hours:0})).status,400);assert.equal((await fetch(u+'/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);});
test('Unconfigured public app fails closed',async t=>{const u=await serve(t,await createApp());assert.equal((await post(u)).status,503);});
test('Official x402 SDK sends a v2 challenge and rejects forged payment',async t=>{
 const f=facilitator(),u=await serve(t,await createApp({payment:{payTo,network,price:'$0.01',facilitator:f}}));
 const r=await post(u);assert.equal(r.status,402);const required=JSON.parse(Buffer.from(r.headers.get('payment-required'),'base64'));assert.equal(required.x402Version,2);assert.equal(required.accepts[0].amount,'10000');assert.equal(required.accepts[0].payTo,payTo);
 const s=await post(u,body,{'payment-signature':await signedHeader(u)});assert.equal(s.status,402);assert.equal(f.calls.verify,1);assert.equal(f.calls.settle,0);
 assert.equal((await post(u,{...body,window_hours:0})).status,400);
});
test('SDK verifies and settles before releasing a successful response (facilitator test double)',async t=>{
 const f=facilitator({valid:true}),u=await serve(t,await createApp({payment:{payTo,network,price:'$0.01',facilitator:f}}));
 const r=await post(u,body,{'payment-signature':await signedHeader(u)});assert.equal(r.status,200);assert.ok(r.headers.get('payment-response'));assert.equal(f.calls.verify,1);assert.equal(f.calls.settle,1);assert.ok((await r.json()).IL_percent<0);
});
test('Settlement failure withholds calculation',async t=>{
 const f=facilitator({valid:true,settles:false}),u=await serve(t,await createApp({payment:{payTo,network,price:'$0.01',facilitator:f}}));
 const r=await post(u,body,{'payment-signature':await signedHeader(u)});assert.equal(r.status,402);assert.equal(f.calls.settle,1);assert.equal('IL_percent' in await r.json(),false);
});
test('Data errors do not settle payments',async t=>{
 const f=facilitator({valid:true}),u=await serve(t,await createApp({provider:{estimate:async()=>{throw new Error('rpc failed');}},payment:{payTo,network,price:'$0.01',facilitator:f}}));
 const {snapshot,...live}=body;const r=await post(u,live,{'payment-signature':await signedHeader(u)});assert.equal(r.status,502);assert.equal(f.calls.settle,0);
});
test('Missing recipient and unsupported payment network are rejected at startup',async()=>{
 await assert.rejects(()=>createApp({payment:{payTo:ZERO,network,price:'$0.01'}}));
 await assert.rejects(()=>createApp({payment:{payTo,network:'eip155:1',price:'$0.01'}}));
});
const ZERO='0x0000000000000000000000000000000000000000';
test('Case and trailing-slash route variants cannot bypass the payment gate',async t=>{
 const f=facilitator(),u=await serve(t,await createApp({payment:{payTo,network,price:'$0.01',facilitator:f}}));
 for(const path of ['/ESTIMATE','/estimate/','/%65stimate','//estimate']){
 const r=await fetch(u+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.notEqual(r.status,200,path);assert.equal('IL_percent' in await r.json(),false,path);
 }
});
