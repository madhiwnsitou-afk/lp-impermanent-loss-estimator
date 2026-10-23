/** Historical accounting backtest, not a price forecast. */
import {readFile,writeFile} from 'node:fs/promises';
import {formatUnits} from 'viem';
import {replay,estimateCapture,ZERO} from '../src/chain.js';
const path=process.argv[2]??'evidence/onchain-capture.json';
const c=JSON.parse(await readFile(path,'utf8'));
function atBoundary(block){
 if(block===c.end.block_number)return c.end;
 let prior=c.events.filter(e=>e.block_number<=block);const sync=prior.filter(e=>e.event==='Sync').at(-1);
 if(!sync)return null;
 block=sync.block_number;prior=prior.filter(e=>e.block_number<=block);
 let supply=BigInt(c.start.total_supply);
 for(const e of prior)if(e.event==='Transfer'){
 if(e.args.from.toLowerCase()===ZERO)supply+=BigInt(e.args.value);
 else if(e.args.to.toLowerCase()===ZERO)supply-=BigInt(e.args.value);
 }
 return {block_number:block,block_hash:sync.block_hash,timestamp:sync.timestamp,reserve0:sync.args.reserve0,reserve1:sync.args.reserve1,total_supply:supply.toString()};
}
const anchors=[c.start];
for(let i=1;i<4;i++){const b=Math.floor(c.start.block_number+(c.end.block_number-c.start.block_number)*i/4),s=atBoundary(b);if(s&&s.timestamp>anchors.at(-1).timestamp)anchors.push(s);}
anchors.push(c.end);
const results=[];
for(let i=1;i<anchors.length;i++){
 const start=anchors[i-1],end=anchors[i],events=c.events.filter(e=>e.block_number>start.block_number&&e.block_number<=end.block_number);
 const ledger=replay(start,events);
 const reconstructed={...end,reserve0:ledger.reserve0,reserve1:ledger.reserve1,total_supply:ledger.total_supply};
 const amounts=[Number(formatUnits(BigInt(start.reserve0),c.metadata.tokens[0].decimals)),Number(formatUnits(BigInt(start.reserve1),c.metadata.tokens[1].decimals))];
 const req={pool_address:c.pool_address,token_weights:[.5,.5],deposit_amounts:amounts,window_hours:(end.timestamp-start.timestamp)/3600};
 const estimate=estimateCapture(req,{...c,start,end:reconstructed,events});
 const actual=[Number(formatUnits(BigInt(end.reserve0),c.metadata.tokens[0].decimals)),Number(formatUnits(BigInt(end.reserve1),c.metadata.tokens[1].decimals))];
 const endPrice=actual[1]/actual[0],supplyRatio=Number(start.total_supply)/Number(end.total_supply);
 const observed=(actual[0]*endPrice+actual[1])*supplyRatio;
 const predicted=estimate.lp_value_including_observed_growth;
 const error=100*Math.abs(predicted-observed)/observed;
 results.push({start_block:start.block_number,end_block:end.block_number,swaps:ledger.swaps,observed_lp_value:observed,reconstructed_lp_value:predicted,relative_error_percent:error,raw_reserves_match:ledger.reserve0===end.reserve0&&ledger.reserve1===end.reserve1,raw_supply_match:ledger.total_supply===end.total_supply,IL_percent:estimate.IL_percent,fee_apr_est:estimate.fee_apr_est,volume_window:estimate.volume_window});
}
const maxError=Math.max(...results.map(x=>x.relative_error_percent));
const pass=results.length>0&&results.every(x=>x.raw_reserves_match&&x.raw_supply_match&&x.relative_error_percent<10);
const report={benchmark:'Historical event-ledger accounting vs observed pool withdrawal value',passed:pass,threshold_relative_error_percent:10,max_relative_error_percent:maxError,windows:results.length,pool_address:c.pool_address,chain_id:1,tokens:c.metadata.tokens,source:c.source,captured_at:c.captured_at,
 methodology:['Starting reserves are historical Sync observations; finalized end reserves and supply are eth_call observations.','The predictor independently replays Swap/Mint/Burn deltas, without taking reserves from Sync events.','Intermediate reference reserves are Sync observations. LP supplies are anchored to finalized totalSupply and actual LP Transfer mint/burn events.','Per-window reconstructed LP value includes observed invariant growth, then is compared with actual reserve withdrawal at the end price.','These are backward-looking accounting tests. Fee-exclusive IL has no directly observable separate on-chain balance. This does not demonstrate future yield accuracy.'],
 limitations:['One canonical Uniswap V2 pool and one captured hour; limited market movement.','No independently sourced realized weighted or concentrated-liquidity position benchmark.','Sponsor has not defined the metric for the <10% criterion; sponsor acceptance is unconfirmed.','x402 paid happy-path tests use a facilitator test double; no live on-chain payment made.'],results};
await writeFile('evidence/backtest-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(!pass)process.exitCode=1;
