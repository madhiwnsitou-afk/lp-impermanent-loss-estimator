import {readFile,writeFile} from 'node:fs/promises';import {formatUnits} from 'viem';
const c=JSON.parse(await readFile('evidence/onchain-capture.json'));
const q=c.metadata.tokens.map((t,i)=>Number(formatUnits(BigInt(c.start[`reserve${i}`]),t.decimals))*0.00001);
const req={pool_address:c.pool_address,token_weights:[.5,.5],deposit_amounts:q,window_hours:1,protocol:'uniswap-v2'};
await writeFile('examples/live-v2.json',JSON.stringify(req,null,2)+'\n');console.log(req);
