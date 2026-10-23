import { weightedPosition,concentratedPosition,feeApr,value } from './math.js';
import { parseRequest } from './schema.js';
export async function estimate(input,{provider}={}) {
  const req=parseRequest(input);
  if(!req.snapshot){
    if(!provider)throw Object.assign(new Error('Historical data provider unavailable'),{status:503});
    return provider.estimate(req);
  }
  const s=req.snapshot;
  const result=req.protocol==='uniswap-v3'?concentratedPosition({...req,...s}):weightedPosition({...req,...s});
  const notes=[
    'IL_percent is signed loss relative to holding the same original tokens, excluding fees; -5.72 means a 5.72% shortfall.',
    'Snapshot calculations use caller-supplied data, not independently fetched market observations.',
    'APR is simple annualization of a historical window, not a forecast or guaranteed return.',
    'The model uses a proportional join. Excess tokens stay idle, included in both portfolio and HODL; swap costs for alternative joins are not modeled.'
  ];
  let apr=null,feeValue=null;
  if(s.fees_earned){feeValue=value(s.fees_earned,s.prices_end);apr=100*feeValue/result.initial_value*(8760/req.window_hours);notes.push('APR uses supplied position fee amounts marked at end prices, divided by initial position value.');}
  else if(req.protocol!=='uniswap-v3'&&s.volume_window!==undefined&&s.average_tvl!==undefined&&s.fee_rate!==undefined){
    apr=feeApr({volume:s.volume_window,fee_rate:s.fee_rate,average_tvl:s.average_tvl,window_hours:req.window_hours});
    notes.push('Fee APR is a pool-level gross estimate, before protocol fees, dilution and transaction costs.');
  }else notes.push('Fee APR unavailable: no position fees or adequate volume/TVL/fee data.');
  if(req.protocol==='uniswap-v3')notes.push('Fixed-range V3 principal model includes unused deposit tokens as idle holdings. Fee income requires position-level earned fees; pool-wide volume cannot determine active-range share. token_weights are retained for input compatibility but do not set V3 allocation.');
  if(req.protocol==='weighted')notes.push('Fixed weights and constant-mean invariant only; stable-swap and dynamically changing weights are unsupported.');
  return {...result,fee_apr_est:apr,volume_window:s.volume_window??null,notes,
    pool_address:req.pool_address,protocol:req.protocol,window_hours:req.window_hours,numeraire:s.numeraire,
    data_quality:'caller-supplied',provenance:{source:s.source},
    ...(feeValue!==null?{fees_value:feeValue,lp_value_including_fees:result.lp_value_ex_fees+feeValue,net_vs_hold_percent:100*((result.lp_value_ex_fees+feeValue)/result.hold_value-1)}:{})};
}
