import {x402Client,x402HTTPClient} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {createWalletClient,custom} from 'viem';
import {baseSepolia} from 'viem/chains';
const recipient='0x8b66e689b416ce9896d9f1b4553e38404d141211';
const asset='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const button=document.querySelector('#pay'),status=document.querySelector('#status'),result=document.querySelector('#result'),receipt=document.querySelector('#receipt');
let discovered;
window.addEventListener('eip6963:announceProvider',e=>{if(e.detail.info.rdns==='io.metamask')discovered=e.detail.provider;});
window.dispatchEvent(new Event('eip6963:requestProvider'));
button.onclick=async()=>{
 button.disabled=true;result.hidden=true;receipt.textContent='';
 try{
  const provider=discovered??window.ethereum?.providers?.find(p=>p.isMetaMask)??window.ethereum;
  if(!provider)throw new Error('MetaMask is not connected to this browser. Open this link in the MetaMask in-app browser, or use Chrome with the official MetaMask extension.');
  status.textContent='Approve the wallet connection in MetaMask.';
  const [account]=await provider.request({method:'eth_requestAccounts'});
  if(!account)throw new Error('No wallet account selected.');
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});}
  catch(e){if(e.code!==4902)throw e;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x14a34',chainName:'Base Sepolia',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});}
  if(await provider.request({method:'eth_chainId'})!=='0x14a34')throw new Error('Select Base Sepolia before continuing.');
  const wallet=createWalletClient({account,chain:baseSepolia,transport:custom(provider)});
  const signer={address:account,signTypedData:args=>wallet.signTypedData(args)};
  const http=new x402HTTPClient(new x402Client().register('eip155:84532',new ExactEvmScheme(signer)));
  const body=JSON.stringify({pool_address:'0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',protocol:'uniswap-v2',token_weights:[0.5,0.5],deposit_amounts:[1,1000],window_hours:24,snapshot:{prices_start:[1000,1],prices_end:[2000,1],numeraire:'USD',volume_window:1000000,average_tvl:10000000,fee_rate:0.003,source:'Synthetic 2x price example; payment smoke test only'}});
  const request={method:'POST',headers:{'Content-Type':'application/json'},body};
  status.textContent='Requesting the payment challenge…';
  const challenge=await fetch('/estimate',request);
  if(challenge.status!==402)throw new Error('Expected a 402 payment challenge; got '+challenge.status);
  const required=http.getPaymentRequiredResponse(n=>challenge.headers.get(n));
  if(required.accepts.length!==1)throw new Error('Unexpected payment options.');
  const offer=required.accepts[0];
  if(offer.network!=='eip155:84532'||offer.scheme!=='exact'||offer.amount!=='10000'||offer.asset.toLowerCase()!==asset||offer.payTo.toLowerCase()!==recipient)throw new Error('Payment details differ from the expected 0.01 test-USDC payment. Stopped before signing.');
  status.textContent='Review and sign the 0.01 test-USDC authorization in MetaMask. No token approval or real-money transaction is requested.';
  const payload=await http.createPaymentPayload(required);
  status.textContent='Submitting authorization and waiting for settlement…';
  const paid=await fetch('/estimate',{...request,headers:{...request.headers,...http.encodePaymentSignatureHeader(payload)}});
  const output=await paid.json();
  result.hidden=false;result.textContent=JSON.stringify(output,null,2);
  if(!paid.ok)throw new Error('The paid request returned '+paid.status+'. See the response below.');
  const settled=http.getPaymentSettleResponse(n=>paid.headers.get(n));
  if(!settled.success||settled.network!=='eip155:84532'||!/^0x[0-9a-f]{64}$/i.test(settled.transaction??''))throw new Error('A successful on-chain settlement receipt was not returned.');
  if(Math.abs(output.IL_percent-(-5.719095841793664))>0.000001)throw new Error('Payment settled, but the calculation did not match the expected example.');
  const link=document.createElement('a');link.href='https://sepolia.basescan.org/tx/'+settled.transaction;link.textContent='View test payment transaction';link.target='_blank';link.rel='noopener';receipt.append(link);
  status.textContent='Test payment settled and the expected calculation was returned. Save the transaction link for verification.';
 }catch(e){status.textContent=e.message??String(e);}finally{button.disabled=false;}
};
