import test from 'node:test';import assert from 'node:assert/strict';
import {replay,ZERO,blockAtOrBefore} from '../src/chain.js';
const start={reserve0:'1000',reserve1:'2000',total_supply:'100'};
test('Independent ledger accounts for swaps, mint/burn and protocol LP mint',()=>{
 const e=[{event:'Swap',args:{amount0In:'10',amount1In:'0',amount0Out:'0',amount1Out:'19'}},
 {event:'Mint',args:{amount0:'100',amount1:'200'}},{event:'Transfer',args:{from:ZERO,to:'0x1',value:'10'}},
 {event:'Burn',args:{amount0:'50',amount1:'100'}},{event:'Transfer',args:{from:'0x1',to:ZERO,value:'5'}},
 {event:'Sync',args:{reserve0:'0',reserve1:'0'}}];
 const r=replay(start,e);assert.equal(r.reserve0,'1060');assert.equal(r.reserve1,'2081');assert.equal(r.total_supply,'105');assert.equal(r.swaps,1);
});
test('Block timestamp lookup brackets recent history rather than querying pruned genesis history',async()=>{
 const client={getBlock:async({blockNumber})=>{assert.ok(blockNumber>=9000n);return {timestamp:blockNumber*12n};}};
 assert.equal(await blockAtOrBefore(client,119005,10000n),9917n);
});
