import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {formatUnits} from 'viem';
import {estimateCapture,replay} from '../src/chain.js';
const c=JSON.parse(await readFile(new URL('../evidence/onchain-capture.json',import.meta.url)));
const q=c.metadata.tokens.map((t,i)=>Number(formatUnits(BigInt(c.start[`reserve${i}`]),t.decimals)));
const req={pool_address:c.pool_address,deposit_amounts:q,token_weights:[.5,.5],window_hours:1};
test('Captured real historical event ledger exactly matches observed finalized reserves/supply',()=>{
 const ledger=replay(c.start,c.events);for(const k of ['reserve0','reserve1','total_supply'])assert.equal(ledger[k],c.end[k]);assert.equal(ledger.swaps,32);
 const r=estimateCapture(req,c);assert.equal(r.provenance.ledger_matches_end_state,true);assert.equal(r.window_hours,1);assert.ok(r.volume_window>0);assert.ok(r.numeraire.includes(c.metadata.tokens[1].address));
});
test('Missing or altered historical events fail closed instead of silently producing a plausible APR',()=>{
 const bad=structuredClone(c),swap=bad.events.find(e=>e.event==='Swap');swap.args.amount0In=(BigInt(swap.args.amount0In)+1n).toString();
 assert.throws(()=>estimateCapture(req,bad),/replay differs/);
});
test('Unbalanced V2 deposit keeps idle tokens out of LP invariant-growth accounting',()=>{
 const r=estimateCapture({...req,deposit_amounts:[q[0]*2,q[1]]},c),p1=Number(formatUnits(BigInt(c.end.reserve1),18))/Number(formatUnits(BigInt(c.end.reserve0),6));
 const observedActive=2*Number(formatUnits(BigInt(c.end.reserve1),18))*Number(c.start.total_supply)/Number(c.end.total_supply);
 const observedIdle=q[0]*p1;
 assert.ok(Math.abs(r.lp_value_including_observed_growth-observedActive-observedIdle)<1e-8);
});
