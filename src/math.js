/** Deterministic AMM accounting. Prices must share one numeraire. */
export class InputError extends Error { constructor(message) { super(message); this.status = 400; } }
export const sum = xs => xs.reduce((a,b) => a+b, 0);
export const value = (amounts, prices) => sum(amounts.map((x,i) => x*prices[i]));
export function finite(x, label, {positive=false, nonnegative=false}={}) {
  if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x)>1e100 || (positive && x<=0) || (nonnegative && x<0)) throw new InputError(`${label} must be a finite ${positive?'positive':nonnegative?'nonnegative':''} number`);
  return x;
}
export function vector(xs, label, n, opts) {
  if (!Array.isArray(xs) || xs.length!==n) throw new InputError(`${label} must contain ${n} numbers in pool token order`);
  return xs.map((x,i)=>finite(x,`${label}[${i}]`,opts));
}
export function weights(ws) {
  if (!Array.isArray(ws) || ws.length<2 || ws.length>8) throw new InputError('token_weights must contain 2–8 weights');
  ws.forEach((w,i)=>finite(w,`token_weights[${i}]`,{positive:true}));
  if (Math.abs(sum(ws)-1)>1e-9) throw new InputError('token_weights must sum to 1 (use 0.8, not 80)');
  return ws;
}
function finish(held, lp, extras={}) {
  if (!(held>0) || !Number.isFinite(held) || !Number.isFinite(lp) || lp<0) throw new InputError('Position value is zero or outside supported numerical range');
  const il = 100*Math.expm1(Math.log(lp/held));
  return {IL_percent:Math.abs(il)<1e-10?0:il, hold_value:held, lp_value_ex_fees:lp,...extras};
}
/** Constant-mean invariant: relative LP growth = product(price relatives ** weight). */
export function weightedPosition({token_weights,deposit_amounts,prices_start,prices_end}) {
  const w=weights(token_weights), n=w.length;
  const q=vector(deposit_amounts,'deposit_amounts',n,{nonnegative:true});
  const p0=vector(prices_start,'prices_start',n,{positive:true});
  const p1=vector(prices_end,'prices_end',n,{positive:true});
  const v0=value(q,p0);
  if (!(v0>0) || !Number.isFinite(v0)) throw new InputError('Deposit must have positive finite value');
  const active=Math.min(...q.map((x,i)=>x*p0[i]/w[i]));
  if(!(active>0))throw new InputError('A proportional join needs a positive amount of every pool token');
  const idle=q.map((x,i)=>Math.max(0,x-active*w[i]/p0[i]));
  const growth=Math.exp(sum(w.map((x,i)=>x*(Math.log(p1[i])-Math.log(p0[i])))));
  const idleEnd=value(idle,p1),activeEnd=active*growth;
  return finish(value(q,p1),activeEnd+idleEnd,{initial_value:v0,active_initial_value:active,active_lp_value_ex_fees:activeEnd,idle_amounts:idle,idle_value_end:idleEnd,model:'constant-mean',price_relatives:p1.map((p,i)=>p/p0[i])});
}
/** Uniswap V3 principal at fixed liquidity, human-unit token1/token0 price. */
export function concentratedAmounts(liquidity, price, lower, upper) {
  const s=Math.sqrt(Math.min(upper,Math.max(lower,price))), a=Math.sqrt(lower),b=Math.sqrt(upper);
  return [liquidity*(b-s)/(s*b),liquidity*(s-a)];
}
export function concentratedPosition({deposit_amounts,prices_start,prices_end,price_lower,price_upper}) {
  const q=vector(deposit_amounts,'deposit_amounts',2,{nonnegative:true});
  const p0=vector(prices_start,'prices_start',2,{positive:true}),p1=vector(prices_end,'prices_end',2,{positive:true});
  finite(price_lower,'price_lower',{positive:true});finite(price_upper,'price_upper',{positive:true});
  if (price_lower>=price_upper) throw new InputError('price_lower must be less than price_upper');
  const unit=concentratedAmounts(1,p0[0]/p0[1],price_lower,price_upper);
  const candidates=unit.map((x,i)=>x>0?q[i]/x:Infinity);
  const l=Math.min(...candidates);
  if (!(l>0) || !Number.isFinite(l)) throw new InputError('Deposit cannot mint liquidity at the starting price and chosen range');
  const used=unit.map(x=>x*l), idle=q.map((x,i)=>Math.max(0,x-used[i]));
  const end=concentratedAmounts(l,p1[0]/p1[1],price_lower,price_upper).map((x,i)=>x+idle[i]);
  return finish(value(q,p1),value(end,p1),{initial_value:value(q,p0),model:'concentrated',liquidity:l,idle_amounts:idle,amounts_end:end,in_range_end:p1[0]/p1[1]>price_lower&&p1[0]/p1[1]<price_upper});
}
export function feeApr({volume,fee_rate,average_tvl,window_hours}) {
  finite(volume,'volume',{nonnegative:true});finite(fee_rate,'fee_rate',{nonnegative:true});
  if(fee_rate>=1) throw new InputError('fee_rate must be less than 1');
  finite(average_tvl,'average_tvl',{positive:true});finite(window_hours,'window_hours',{positive:true});
  const apr=100*(volume*fee_rate/average_tvl)*(365*24/window_hours);
  if(!Number.isFinite(apr))throw new InputError('Fee APR outside supported numerical range');
  return apr;
}
