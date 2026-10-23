# LP Impermanent Loss Estimator — submission draft (not filed)

Related issue: https://github.com/daydreamsai/agent-bounties/issues/7

Deterministic AMM accounting with fixed-weight constant-mean and fixed-range concentrated-liquidity math, historical Ethereum Uniswap V2 event ingestion, and the official x402 SDK payment gateway.

## Evidence

See `evidence/test-output.txt`, `evidence/onchain-capture.json` and `evidence/backtest-report.json`. Historical benchmark is reserve-event reconstruction vs observed withdrawal value, not a forecast. Weighted/V3 models have reference-case and boundary tests, but no independent realized-position historical benchmark.

## Acceptance status

- [x] Required input/output fields implemented.
- [x] Constant-product, fixed-weight and concentrated-range principal math.
- [x] Official x402 verification and settlement middleware implemented and tested with a facilitator double.
- [ ] Sponsor confirms interpretation of the <10% historical error criterion and required AMMs.
- [ ] Public HTTPS deployment with user's receiving address.
- [ ] Successful end-to-end live x402 payment.
- [ ] Independent weighted and V3 realized-position backtests.
- [ ] Reward availability/eligibility confirmed by sponsor.

Deployment URL: NOT DEPLOYED
Source repository URL: NOT PUBLISHED
Solana payout wallet: NOT PROVIDED

Do not file this draft as a completed bounty claim until the outstanding evidence exists. No claim of having earned or reserved $1,000 is made.
