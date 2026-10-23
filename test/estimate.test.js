import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {estimate} from '../src/estimate.js';
const v2=JSON.parse(await readFile(new URL('../examples/v2.json',import.meta.url)));
test('Spec-exact fields and explicit snapshot provenance',async()=>{const r=await estimate(v2);for(const k of ['IL_percent','fee_apr_est','volume_window','notes'])assert.ok(k in r);assert.equal(r.data_quality,'caller-supplied');assert.equal(r.fee_apr_est,10.95);});
test('Unknown fee data remains null; V3 never pretends pool fee APR is position APR',async()=>{
 const s={...v2.snapshot};delete s.volume_window;delete s.fee_rate;delete s.average_tvl;
 assert.equal((await estimate({...v2,snapshot:s})).fee_apr_est,null);
 const v3={...v2,protocol:'uniswap-v3',snapshot:{...v2.snapshot,price_lower:500,price_upper:2000}};
 assert.equal((await estimate(v3)).fee_apr_est,null);
});
test('Rejects wrong address, length, negative values, unknown fields, zero window, nonfinite data',async()=>{
 for(const patch of [{pool_address:'fake'},{token_weights:[80,20]},{deposit_amounts:[-1,1]},{window_hours:0},{deposit_amounts:[1]},{arbitrary:'ignored?'},{snapshot:{...v2.snapshot,prices_end:[NaN,1]}}])await assert.rejects(()=>estimate({...v2,...patch}));
});
test('Provider only used without a snapshot',async()=>{let calls=0;const provider={estimate:async r=>{calls++;assert.equal(r.pool_address,v2.pool_address);return {ok:true};}};await estimate(v2,{provider});assert.equal(calls,0);const {snapshot,...live}=v2;assert.deepEqual(await estimate(live,{provider}),{ok:true});assert.equal(calls,1);});
test('Unavailable live provider fails instead of inventing prices',async()=>{const {snapshot,...live}=v2;await assert.rejects(()=>estimate(live),/provider unavailable/);});
test('Supplied position fees are distinct from fee-exclusive IL',async()=>{const r=await estimate({...v2,snapshot:{...v2.snapshot,fees_earned:[.001,2]}});assert.equal(r.fees_value,4);assert.equal(r.lp_value_including_fees,r.lp_value_ex_fees+4);});
