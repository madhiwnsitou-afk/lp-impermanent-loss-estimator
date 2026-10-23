import {mkdir,writeFile} from 'node:fs/promises';
import {HistoricalProvider,createChain} from '../src/chain.js';
const address=process.argv[2]??'0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';
const hours=Number(process.argv[3]??1);
const provider=new HistoricalProvider(createChain(process.env.RPC_URL));
const capture=await provider.capture(address,hours);
await mkdir('evidence',{recursive:true});
await writeFile('evidence/onchain-capture.json',JSON.stringify(capture,null,2)+'\n');
console.log(JSON.stringify({pool:address,start:capture.start,end:capture.end,events:capture.events.length}));
