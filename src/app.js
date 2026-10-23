import express from 'express';
import { isAddress } from 'viem';
import { ZodError } from 'zod';
import { x402ResourceServer,x402HTTPResourceServer,paymentMiddlewareFromHTTPServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import {estimate} from './estimate.js';
import {parseRequest} from './schema.js';
/** Payment tests inject a facilitator; production always uses the official HTTP client. */
export async function createApp({provider,payment,localOnly=false}={}){
 const app=express();app.disable('x-powered-by');app.set('case sensitive routing',true);app.set('strict routing',true);
 app.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
 app.use(express.json({limit:'32kb',strict:true}));
 app.get('/health',(_req,res)=>res.json({status:'ok',service:'lp-impermanent-loss-estimator',version:'1.0.0',mode:payment?'x402':'local-development',historical_provider:!!provider}));
 app.get('/',(_req,res)=>res.json({service:'LP Impermanent Loss Estimator',endpoint:'POST /estimate',required:['pool_address','token_weights','deposit_amounts','window_hours'],protocols:{automatic:['uniswap-v2 (Ethereum canonical factory)'],snapshot:['uniswap-v2','weighted constant-mean','uniswap-v3 fixed-range']},payment:payment?{protocol:'x402',network:payment.network,price:payment.price}:null}));
 // Validate before the paywall so malformed inputs never incur a payment.
 app.post('/estimate',(req,res,next)=>{try{req.validated=parseRequest(req.body);next();}catch(e){next(e);}});
 if(payment){
 if(!isAddress(payment.payTo)||/^0x0{40}$/i.test(payment.payTo))throw new Error('A valid nonzero PAYMENT_RECIPIENT address is required');
 if(!['eip155:8453','eip155:84532'].includes(payment.network))throw new Error('Only Base or Base Sepolia payment networks are supported');
 if(!/^\$0\.\d{1,6}$/.test(payment.price)||Number(payment.price.slice(1))<=0)throw new Error('Payment price must be positive and below $1');
 const facilitator=payment.facilitator??new HTTPFacilitatorClient({url:payment.facilitatorUrl,timeoutMs:15000});
 const server=new x402ResourceServer(facilitator).register(payment.network,new ExactEvmScheme());
 const routes={'POST /estimate':{accepts:[{scheme:'exact',price:payment.price,network:payment.network,payTo:payment.payTo}],description:'Estimate LP impermanent loss and historical fee APR',mimeType:'application/json'}};
 const httpServer=new x402HTTPResourceServer(server,routes);
 await httpServer.initialize(); // Refuse to start with an unsupported facilitator/network.
 app.use(paymentMiddlewareFromHTTPServer(httpServer,undefined,undefined,false));
 }else if(!localOnly){
 app.post('/estimate',(_req,res)=>res.status(503).json({error:'Payment configuration missing; estimates are disabled'}));
 }
 app.post('/estimate',async(req,res,next)=>{
 try{res.json(await estimate(req.validated,{provider}));}catch(e){next(e);}
 });
 app.use((_req,res)=>res.status(404).json({error:'Not found'}));
 app.use((error,_req,res,_next)=>{
 if(error instanceof ZodError)return res.status(400).json({error:'Invalid request',details:error.issues.map(x=>({path:x.path.join('.'),message:x.message}))});
 if(error.type==='entity.too.large')return res.status(413).json({error:'Request exceeds 32 KiB'});
 if(error.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON'});
 const status=error.status??502;
 res.status(status).json({error:status===400||status===503?error.message:'Upstream data or payment processing failed; no estimate returned'});
 });
 return app;
}
