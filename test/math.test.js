import test from 'node:test';
import assert from 'node:assert/strict';
import {weightedPosition,concentratedPosition,concentratedAmounts,feeApr} from '../src/math.js';
const cp=(ratio)=>weightedPosition({token_weights:[.5,.5],deposit_amounts:[1,1000],prices_start:[1000,1],prices_end:[1000*ratio,1]});
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
test('Known constant-product loss: unchanged, 2x, 4x, half',()=>{near(cp(1).IL_percent,0);near(cp(2).IL_percent,-5.71909584179366);near(cp(4).IL_percent,-20);near(cp(.5).IL_percent,cp(2).IL_percent);});
test('80/20 weighted formula differs from 50/50',()=>{const r=weightedPosition({token_weights:[.8,.2],deposit_amounts:[4,1000],prices_start:[1000,1],prices_end:[2000,1]});near(r.IL_percent,(2**.8/1.8-1)*100);assert.notEqual(r.IL_percent,cp(2).IL_percent);});
test('Multi-asset weighted invariance under token permutation and common price scaling',()=>{
 const a={token_weights:[.5,.3,.2],deposit_amounts:[5,3,2],prices_start:[10,10,10],prices_end:[20,5,12]};
 const r=weightedPosition(a),reverse=Object.fromEntries(Object.entries(a).map(([k,v])=>[k,[...v].reverse()]));
 near(r.IL_percent,weightedPosition(reverse).IL_percent);
 near(r.IL_percent,weightedPosition({...a,prices_end:a.prices_end.map(x=>x*7)}).IL_percent);
});
test('Weighted model keeps excess deposits idle and rejects invalid weights',()=>{
 const r=weightedPosition({token_weights:[.5,.5],deposit_amounts:[1,10],prices_start:[1000,1],prices_end:[1000,1]});near(r.IL_percent,0);near(r.idle_amounts[0],.99);near(r.idle_amounts[1],0);
 assert.throws(()=>weightedPosition({token_weights:[.5,.5],deposit_amounts:[0,10],prices_start:[1000,1],prices_end:[1000,1]}),/positive amount/);
 for(const w of [[80,20],[0,1],[-1,2],[.4,.4]])assert.throws(()=>weightedPosition({token_weights:w,deposit_amounts:[1,1],prices_start:[1,1],prices_end:[1,1]}));
});
test('Randomized constant-product model agrees with independent reserve solve',()=>{
 let seed=17;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
 for(let i=0;i<500;i++){
 const p0=Math.exp(random()*12-6),p1=Math.exp(random()*12-6),x=Math.exp(random()*8),y=x*p0,k=x*y;
 const endpoint=[Math.sqrt(k/p1),Math.sqrt(k*p1)],reference=100*((endpoint[0]*p1+endpoint[1])/(x*p1+y)-1);
 const r=weightedPosition({token_weights:[.5,.5],deposit_amounts:[x,y],prices_start:[p0,1],prices_end:[p1,1]});near(r.IL_percent,reference,1e-8);assert.ok(r.IL_percent<=1e-8);
 }
});
test('Fixed-range V3 principal handles unchanged price, both range exits and idle assets',()=>{
 const base={deposit_amounts:[2,2],prices_start:[1,1],price_lower:.25,price_upper:4};
 near(concentratedPosition({...base,prices_end:[1,1]}).IL_percent,0);
 const up=concentratedPosition({...base,prices_end:[9,1]}),down=concentratedPosition({...base,prices_end:[.1,1]});
 near(up.amounts_end[0],0);near(down.amounts_end[1],0);assert.equal(up.in_range_end,false);assert.equal(down.in_range_end,false);
 const r=concentratedPosition({...base,deposit_amounts:[3,2],prices_end:[1,1]});near(r.idle_amounts[0],1);near(r.IL_percent,0);
});
test('V3 out-of-range starting deposit is one-sided and boundaries continuous',()=>{
 const a=concentratedPosition({deposit_amounts:[1,0],prices_start:[.1,1],prices_end:[1,1],price_lower:.25,price_upper:4});assert.ok(a.liquidity>0);
 const x=concentratedAmounts(10,4,.25,4),y=concentratedAmounts(10,4-1e-10,.25,4);near(x[0],y[0],1e-8);near(x[1],y[1],1e-8);
 assert.throws(()=>concentratedPosition({deposit_amounts:[0,1],prices_start:[.1,1],prices_end:[1,1],price_lower:.25,price_upper:4}),/cannot mint/);
});
test('Fee APR uses simple annualization, not compounding or a fake fixed yield',()=>{near(feeApr({volume:1e6,fee_rate:.003,average_tvl:1e7,window_hours:24}),10.95);near(feeApr({volume:0,fee_rate:.003,average_tvl:1e7,window_hours:24}),0);assert.throws(()=>feeApr({volume:1,fee_rate:.003,average_tvl:0,window_hours:24}));});
