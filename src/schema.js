import { z } from 'zod';
const positive=z.number().finite().positive().max(1e100);
const nonnegative=z.number().finite().nonnegative().max(1e100);
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const requestSchema=z.object({
  pool_address:address,
  token_weights:z.array(positive).min(2).max(8),
  deposit_amounts:z.array(nonnegative).min(2).max(8),
  window_hours:z.number().finite().positive().max(24*90),
  protocol:z.enum(['uniswap-v2','weighted','uniswap-v3']).default('uniswap-v2'),
  chain_id:z.literal(1).default(1),
  snapshot:z.object({
    prices_start:z.array(positive).min(2).max(8),prices_end:z.array(positive).min(2).max(8),
    numeraire:z.string().min(1).max(40),
    volume_window:nonnegative.optional(),average_tvl:positive.optional(),fee_rate:z.number().finite().min(0).max(0.1).optional(),
    fees_earned:z.array(nonnegative).min(2).max(8).optional(),
    price_lower:positive.optional(),price_upper:positive.optional(),
    source:z.string().min(1).max(500)
  }).strict().optional()
}).strict().superRefine((r,ctx)=>{
  if(Math.abs(r.token_weights.reduce((a,b)=>a+b,0)-1)>1e-9)ctx.addIssue({code:'custom',message:'token_weights must sum to 1',path:['token_weights']});
  if(r.deposit_amounts.length!==r.token_weights.length)ctx.addIssue({code:'custom',message:'deposit_amounts and token_weights lengths differ'});
  if(r.deposit_amounts.every(x=>x===0))ctx.addIssue({code:'custom',message:'Deposit must be nonzero'});
  if(r.protocol!=='uniswap-v2'&&!r.snapshot)ctx.addIssue({code:'custom',message:'weighted and uniswap-v3 require an explicit snapshot; automatic pool discovery is V2 only'});
  if(r.protocol==='uniswap-v2'&&(r.token_weights.length!==2||r.token_weights.some(x=>Math.abs(x-0.5)>1e-9)))ctx.addIssue({code:'custom',message:'V2 pools require [0.5,0.5] weights'});
  if(r.protocol==='uniswap-v3'&&r.token_weights.length!==2)ctx.addIssue({code:'custom',message:'V3 requires two tokens'});
  if(r.snapshot){
    const s=r.snapshot,n=r.token_weights.length;
    for(const key of ['prices_start','prices_end','fees_earned'])if(s[key]&&s[key].length!==n)ctx.addIssue({code:'custom',message:`${key} length differs from token_weights`});
    if(r.protocol==='uniswap-v3'&&(!s.price_lower||!s.price_upper||s.price_lower>=s.price_upper))ctx.addIssue({code:'custom',message:'V3 needs price_lower < price_upper in token1/token0 human units'});
  }
});
export function parseRequest(input){return requestSchema.parse(input);}
