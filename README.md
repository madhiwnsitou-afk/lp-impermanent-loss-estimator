# LP Impermanent Loss Estimator — bounty #7

Original task: https://github.com/daydreamsai/agent-bounties/issues/7

A deterministic service for fee-exclusive impermanent loss, historical gross fee APR, and reproducible event-level validation. No LLM, OpenAI API key, exchange account or trading permission is needed. This service analyzes positions; it does not trade.

## Run locally

Requires Node.js 22 or newer (tested on 24).

```sh
npm ci
npm test
npm start
```

Local development binds to `127.0.0.1:4021` and does not charge payments. In another terminal:

```sh
curl http://127.0.0.1:4021/health
curl -X POST http://127.0.0.1:4021/estimate \
  -H 'Content-Type: application/json' --data-binary @examples/v2.json
npm run example
```

The example doubles one token's price: fee-exclusive IL is **−5.71909584%**, not a prediction about cryptocurrency returns. Synthetic examples are explicitly labeled and are not used as historical evidence.

## Inputs and output

Required: `pool_address`, `token_weights`, `deposit_amounts`, `window_hours`.

Amounts must be human units in pool token order. Weights are fractions summing to one. Prices share a single numeraire. Outputs include the exact requested keys `IL_percent`, `fee_apr_est`, `volume_window`, `notes`, plus values and provenance. A negative IL is a shortfall relative to holding the original tokens. Missing fee data returns `null`, never a fabricated yield.

### Historical Ethereum Uniswap V2

Omit `snapshot` and use `protocol: "uniswap-v2"` (the default). Only the canonical Ethereum Uniswap V2 factory is accepted. A public Ethereum RPC is the default; `RPC_URL` can select a trusted alternative. No RPC URL can be supplied through a public request.

The pool's token order and starting reserve ratio determine the active proportional deposit. For USDC/WETH, token0 is USDC and token1 WETH; do not assume ETH comes first. An unbalanced deposit uses the limiting token; the excess remains idle and is included in the portfolio/HODL comparison. Use the capture and example preparation commands below to create a correctly balanced real request.

```sh
npm run capture
npm run backtest
node scripts/live-example.js
curl -X POST http://127.0.0.1:4021/estimate \
  -H 'Content-Type: application/json' --data-binary @examples/live-v2.json
```

A fresh live call uses a new finalized window, so a previously generated balanced deposit can have a small idle remainder. For reproducibility, use the captured snapshot with `scripts/backtest.js`. Proportional joins require a positive amount of every pool token; single-sided swaps into LP shares are not modeled. Automatic historical requests cover at most 168 hours and 20,000 logs, with at most two concurrent uncached scans. Busy windows should be shortened. A scan may take minutes.

Historical reserves come from real Sync logs. Starting LP supply is rolled backward from finalized totalSupply through actual LP mint/burn Transfer events. Swap/Mint/Burn amounts independently reconstruct reserve deltas and must reproduce the observed end reserves exactly. Missing/inconsistent history fails closed. If the finalized head moves while tagged snapshots are being read, retry; values are never mixed silently.

Volume and time-weighted TVL are measured in **token1 units at the window-end price**, not mislabeled USD. Gross fee APR uses 0.3% × input swap notional / time-weighted TVL × 8760 / window hours. This is historical simple annualization before protocol fees, gas, dilution and other costs. Reserve-derived prices are spot observations, not manipulation-resistant external oracles.

### Explicit weighted snapshots

See `examples/weighted.json`. Supports two to eight assets and fixed weights. The limiting token determines a proportional join matching the weights; excess stays idle. The no-fee invariant gives LP growth as the weighted geometric mean of price relatives; HODL growth is their weighted arithmetic mean. This covers constant-mean Balancer-style pools, not stable-swap or changing-weight pools.

### Explicit concentrated-liquidity snapshots

See `examples/v3.json`. `price_lower`/`price_upper` are human-unit token1/token0 prices, independent of chain tick-decimal encoding. Principal follows the exact fixed-range V3 liquidity equations inside and outside the range. Unused deposited tokens remain idle and are included in both LP and holding comparisons. `token_weights` is retained for input compatibility; range and deposits determine V3 allocation.

Pool-wide fee volume cannot determine a concentrated position's fee income. Supply actual position `fees_earned` amounts to obtain historical position fee APR; otherwise it is null. Automatic V3 position discovery, NFT fee-growth reads and automatic weighted history are not implemented.

## Real x402 integration

Uses the official `@x402/express`, `@x402/core`, and `@x402/evm` SDKs; it does not accept a payment merely because a header exists. The facilitator verifies the authorization and settles before the SDK releases a successful estimate. Errors do not settle. The server needs only a **public receiving address**, never a wallet private key.

For public deployment, provide an HTTPS domain, `NODE_ENV=production`, `PAYMENT_RECIPIENT`, `PAYMENT_NETWORK` and `FACILITATOR_URL`. See `.env.example`. Base Sepolia is the test default; a mainnet facilitator must explicitly support Base (`eip155:8453`). Network compatibility is checked during startup. Do not substitute a sample or another contributor's wallet address. `Dockerfile` is included. No public deployment, payment or bounty submission has been made by this package.

Payment tests exercise the actual SDK against an injected facilitator test double: unpaid challenge, forged-signature rejection, verify+settle success, settlement failure, and upstream failure without settlement. These are not a claim of a live paid-chain test. Facilitator honesty, availability and chain-level replay prevention remain external dependencies.

## Verification and acceptance

`npm test` exercises mathematical reference cases, 500 deterministic randomized reserve-solver comparisons, V3 range boundaries, request rejection, event replay, and payment routing. `npm run backtest` consumes the included captured chain data without network access and writes `evidence/backtest-report.json`.

The historical benchmark is a **backward-looking accounting reconstruction**, not forecasting. End-of-window withdrawal values are compared with event-reconstructed reserves/supply. Fee-exclusive IL is reported separately because it is not itself an on-chain balance. The benchmark is restricted to the captured pool/window; it does not establish broad live accuracy for every AMM. The bounty does not define its error metric or mandatory dataset, so sponsor acceptance cannot be inferred solely from a passing local benchmark.

See `STATUS.md` for the concrete acceptance gaps. A submission draft is in `submission/`; its unchecked items must stay unchecked until completed. The bounty is first qualifying submission wins; an open issue does not prove that $1,000 remains available.

## Formula references

- Uniswap V2 returns: https://docs.uniswap.org/contracts/v2/concepts/advanced-topics/understanding-returns
- Uniswap V2 pair events and reserve/supply behavior: https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol
- Balancer weighted math: https://docs.balancer.fi/concepts/explore-available-balancer-pools/weighted-pool/weighted-math.html
- Uniswap V3 liquidity math: https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/LiquidityAmounts.sol
- x402 official Express example: https://github.com/coinbase/x402/blob/main/examples/typescript/servers/express/index.ts
