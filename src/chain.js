import { createPublicClient,http,parseAbi,decodeEventLog,formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { weightedPosition,feeApr,InputError } from './math.js';
export const PAIR_ABI=parseAbi([
 'function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)',
 'function totalSupply() view returns (uint256)', 'function token0() view returns (address)', 'function token1() view returns (address)',
 'function factory() view returns (address)',
 'event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)',
 'event Mint(address indexed sender,uint256 amount0,uint256 amount1)',
 'event Burn(address indexed sender,uint256 amount0,uint256 amount1,address indexed to)',
 'event Sync(uint112 reserve0,uint112 reserve1)',
 'event Transfer(address indexed from,address indexed to,uint256 value)'
]);
const TOKEN_ABI=parseAbi(['function decimals() view returns (uint8)','function symbol() view returns (string)']);
export const UNISWAP_FACTORY='0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
export const ZERO='0x0000000000000000000000000000000000000000';
export class DataError extends Error { constructor(message){super(message);this.status=502;} }
export function createChain(rpcUrl='https://ethereum-rpc.publicnode.com') {
 const u=new URL(rpcUrl);
 if(!['https:','http:'].includes(u.protocol))throw new InputError('RPC_URL must be HTTP(S)');
 return createPublicClient({chain:mainnet,transport:http(rpcUrl,{timeout:15000,retryCount:2})});
}
export async function readSnapshot(client,address,blockNumber){
 const blockRef=typeof blockNumber==='string'?{blockTag:blockNumber}:{blockNumber};
 const [block,reserves,supply]=await Promise.all([
 client.getBlock(blockRef),
 client.readContract({address,abi:PAIR_ABI,functionName:'getReserves',...blockRef}),
 client.readContract({address,abi:PAIR_ABI,functionName:'totalSupply',...blockRef})]);
 if(reserves[0]<=0n||reserves[1]<=0n||supply<=0n)throw new DataError('Empty or uninitialized pool');
 return {block_number:Number(block.number),block_hash:block.hash,timestamp:Number(block.timestamp),reserve0:reserves[0].toString(),reserve1:reserves[1].toString(),total_supply:supply.toString()};
}
export async function metadata(client,address,blockNumber){
 const blockRef=typeof blockNumber==='string'?{blockTag:blockNumber}:{blockNumber};
 const args={address,abi:PAIR_ABI,...blockRef};
 const [factory,token0,token1]=await Promise.all(['factory','token0','token1'].map(functionName=>client.readContract({...args,functionName})));
 if(factory.toLowerCase()!==UNISWAP_FACTORY.toLowerCase())throw new InputError('Automatic history supports canonical Ethereum Uniswap V2 pools only; use explicit snapshots for other AMMs');
 const canonical=await client.readContract({address:UNISWAP_FACTORY,abi:parseAbi(['function getPair(address,address) view returns (address)']),functionName:'getPair',args:[token0,token1],...blockRef});
 if(canonical.toLowerCase()!==address.toLowerCase())throw new InputError('Pool is not registered by the canonical Uniswap V2 factory');
 const tokens=await Promise.all([token0,token1].map(async address=>{
 const decimals=await client.readContract({address,abi:TOKEN_ABI,functionName:'decimals',...blockRef});
 if(decimals>36)throw new InputError('Token decimals > 36 unsupported');
 let symbol=address;
 try{symbol=await client.readContract({address,abi:TOKEN_ABI,functionName:'symbol',...blockRef});}catch{}
 return {address,symbol,decimals};}));
 return {factory,tokens,fee_rate:0.003};
}
export async function blockAtOrBefore(client,target,endNumber){
 const tip=await client.getBlock({blockNumber:endNumber});
 let span=BigInt(Math.max(2,Math.ceil((Number(tip.timestamp)-target)/6))),hi=endNumber,lo=endNumber>span?endNumber-span:0n;
 while(lo>0n && Number((await client.getBlock({blockNumber:lo})).timestamp)>target){span*=2n;lo=endNumber>span?endNumber-span:0n;}
 while(lo<hi){const mid=(lo+hi+1n)/2n,block=await client.getBlock({blockNumber:mid});if(Number(block.timestamp)<=target)lo=mid;else hi=mid-1n;}
 return lo;
}
export async function eventHistory(client,address,start,end,{chunkSize=1000n,maxLogs=20000}={}) {
 const logs=[];
 for(let from=start+1n;from<=end;from+=chunkSize){
 const to=from+chunkSize-1n>end?end:from+chunkSize-1n;
 const chunk=await client.getLogs({address,fromBlock:from,toBlock:to});
 logs.push(...chunk);
 if(logs.length>maxLogs)throw new InputError('Too many events for one request; shorten window_hours');
 }
 const blockNumbers=[...new Set(logs.map(l=>Number(l.blockNumber)))];
 const times=new Map();
 // Bounded concurrency avoids flooding a public RPC for busy pools.
 for(let i=0;i<blockNumbers.length;i+=4)await Promise.all(blockNumbers.slice(i,i+4).map(async n=>{const b=await client.getBlock({blockNumber:BigInt(n)});times.set(n,Number(b.timestamp));}));
 return logs.flatMap(log=>{
 if(log.removed)throw new DataError('Reorg observed while reading logs; retry');
 let decoded;try{decoded=decodeEventLog({abi:PAIR_ABI,data:log.data,topics:log.topics,strict:true});}catch{return [];}
 return [{event:decoded.eventName,args:Object.fromEntries(Object.entries(decoded.args).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])),block_number:Number(log.blockNumber),block_hash:log.blockHash,transaction_hash:log.transactionHash,log_index:log.logIndex,timestamp:times.get(Number(log.blockNumber))}];
 }).sort((a,b)=>a.block_number-b.block_number||a.log_index-b.log_index);
}
/** Independent event-ledger replay, never taking final reserves from Sync events. */
export function replay(start,events){
 let r0=BigInt(start.reserve0),r1=BigInt(start.reserve1),s=BigInt(start.total_supply);
 let swaps=0,mints=0,burns=0;
 for(const e of events){const a=e.args;
 if(e.event==='Swap'){r0+=BigInt(a.amount0In)-BigInt(a.amount0Out);r1+=BigInt(a.amount1In)-BigInt(a.amount1Out);swaps++;}
 if(e.event==='Mint'){r0+=BigInt(a.amount0);r1+=BigInt(a.amount1);mints++;}
 if(e.event==='Burn'){r0-=BigInt(a.amount0);r1-=BigInt(a.amount1);burns++;}
 if(e.event==='Transfer'){
 if(a.from.toLowerCase()===ZERO)s+=BigInt(a.value);
 else if(a.to.toLowerCase()===ZERO)s-=BigInt(a.value);
 }
 }
 if(r0<=0n||r1<=0n||s<=0n)throw new DataError('Invalid reconstructed state');
 return {reserve0:r0.toString(),reserve1:r1.toString(),total_supply:s.toString(),swaps,mints,burns};
}
const units=(s,tokens)=>[Number(formatUnits(BigInt(s.reserve0),tokens[0].decimals)),Number(formatUnits(BigInt(s.reserve1),tokens[1].decimals))];
export function estimateCapture(req,capture){
 const {start,end,events,metadata:meta}=capture;
 const actualHours=(end.timestamp-start.timestamp)/3600;
 if(!(actualHours>0))throw new DataError('History window is empty');
 const begin=units(start,meta.tokens),finish=units(end,meta.tokens);
 const p0=begin[1]/begin[0],p1=finish[1]/finish[0];
 const result=weightedPosition({token_weights:req.token_weights,deposit_amounts:req.deposit_amounts,prices_start:[p0,1],prices_end:[p1,1]});
 let volume=0,area=0,previous=start.timestamp,current=begin;
 // All volume is marked in token1 at the window END price (not mislabeled USD).
 for(const e of events){
 if(e.event==='Swap')volume+=Number(formatUnits(BigInt(e.args.amount0In),meta.tokens[0].decimals))*p1+Number(formatUnits(BigInt(e.args.amount1In),meta.tokens[1].decimals));
 if(e.event==='Sync'){
 area+=(e.timestamp-previous)*(current[0]*p1+current[1]);previous=e.timestamp;
 current=units({reserve0:e.args.reserve0,reserve1:e.args.reserve1},meta.tokens);
 }
 }
 area+=(end.timestamp-previous)*(current[0]*p1+current[1]);
 const average=area/(end.timestamp-start.timestamp);
 const ledger=replay(start,events);
 const verified=['reserve0','reserve1','total_supply'].every(k=>ledger[k]===end[k]);
 if(!verified)throw new DataError('Event replay differs from on-chain end state (possible donation, rebase or incomplete history); refusing misleading estimate');
 const growth=Math.exp(0.5*(Math.log(finish[0]/begin[0])+Math.log(finish[1]/begin[1]))+Math.log(Number(start.total_supply)/Number(end.total_supply)));
 const lpTotal=result.active_lp_value_ex_fees*growth+result.idle_value_end;
 return {...result,fee_apr_est:feeApr({volume,fee_rate:meta.fee_rate,average_tvl:average,window_hours:actualHours}),
 volume_window:volume,average_tvl:average,window_hours:actualHours,requested_window_hours:req.window_hours,
 pool_address:req.pool_address,protocol:'uniswap-v2',numeraire:`token1:${meta.tokens[1].address}`,token_order:meta.tokens,
 lp_value_including_observed_growth:lpTotal,net_vs_hold_percent:100*(lpTotal/result.hold_value-1),
 notes:[
 'IL_percent excludes fees and compares the LP with holding the same starting token amounts.',
 'Amounts follow on-chain token0/token1 order. A proportional join uses the limiting token; any excess stays idle and is included in the comparison.',
 'Volume and TVL are in token1 units, marked at the END pool price; they are not USD. TVL is time-weighted over Sync events.',
 'Fee APR is gross 0.3% swap fee annualization, before protocol fees and costs. It is an estimate, not a forecast.',
 'Observed LP growth includes fees, donations and protocol dilution; it is not labeled pure fee income.',
 'Pool reserve prices are manipulable spot prices, not independent price oracles. Unsupported rebase/donation windows fail if event replay disagrees.'
 ],data_quality:'on-chain-event-replay-verified',
 provenance:{chain_id:1,pool_address:req.pool_address,start,end,swap_count:ledger.swaps,mint_count:ledger.mints,burn_count:ledger.burns,ledger_matches_end_state:verified,captured_at:capture.captured_at}};
}
export class HistoricalProvider {
 constructor(client=createChain()){this.client=client;this.cache=new Map();this.active=0;}
 async capture(address,hours){
 if(hours>168)throw new InputError('Automatic historical window is limited to 168 hours; import snapshots for longer windows');
 const endBlock=await this.client.getBlock({blockTag:'finalized'});
 const startNumber=await blockAtOrBefore(this.client,Number(endBlock.timestamp)-hours*3600,endBlock.number);
 if(startNumber===endBlock.number)throw new InputError('window_hours must span at least one finalized block');
 const [end,meta,startBlock]=await Promise.all([readSnapshot(this.client,address,'finalized'),metadata(this.client,address,'finalized'),this.client.getBlock({blockNumber:startNumber})]);
 if(end.block_hash!==endBlock.hash)throw new DataError('Finalized head advanced during snapshot; retry');
 // Historical reserves come from the last actual Sync event. LP supply is rolled
 // backward from finalized totalSupply using mint/burn Transfer events. No paid
 // archive endpoint is needed; nothing is silently synthesized from token prices.
 let sync;
 const syncEvent=PAIR_ABI.find(x=>x.type==='event'&&x.name==='Sync');
 for(let to=startNumber;to>=0n&&!sync;){
 const from=to>999n?to-999n:0n;
 const logs=await this.client.getLogs({address,event:syncEvent,fromBlock:from,toBlock:to});
 if(logs.length)sync=logs.at(-1);
 if(from===0n||startNumber-from>=5000n)break;
 to=from-1n;
 }
 if(!sync)throw new DataError('No starting Sync found in the preceding 5000 blocks');
 const events=await eventHistory(this.client,address,startNumber,endBlock.number);
 let supply=BigInt(end.total_supply);
 for(const e of events)if(e.event==='Transfer'){
 if(e.args.from.toLowerCase()===ZERO)supply-=BigInt(e.args.value);
 else if(e.args.to.toLowerCase()===ZERO)supply+=BigInt(e.args.value);
 }
 if(supply<=0n)throw new DataError('Pool was initialized inside this history window');
 const start={block_number:Number(startNumber),block_hash:startBlock.hash,timestamp:Number(startBlock.timestamp),reserve0:sync.args.reserve0.toString(),reserve1:sync.args.reserve1.toString(),total_supply:supply.toString(),reserve_source:{transaction_hash:sync.transactionHash,block_number:Number(sync.blockNumber),log_index:sync.logIndex},supply_source:'finalized totalSupply rolled backward through LP mint/burn Transfer events'};
 const check=await this.client.getBlock({blockTag:'finalized'});
 if(check.hash!==end.block_hash)throw new DataError('Finalized head advanced during capture; retry for a consistent tagged snapshot');
 return {schema_version:1,source:'Ethereum JSON-RPC finalized eth_call and historical eth_getLogs',captured_at:new Date().toISOString(),pool_address:address,metadata:meta,start,end,events};
 }
 async estimate(req){
 const key=`${req.pool_address.toLowerCase()}:${req.window_hours}`;
 let cached=this.cache.get(key);
 if(!cached||Date.now()-cached.time>60000){
 if(this.active>=2)throw Object.assign(new Error('Historical provider busy; retry shortly'),{status:503});
 this.active++;
 try{cached={time:Date.now(),capture:await this.capture(req.pool_address,req.window_hours)};if(this.cache.size>=32)this.cache.delete(this.cache.keys().next().value);this.cache.set(key,cached);}finally{this.active--;}
 }
 return estimateCapture(req,cached.capture);
 }
}
