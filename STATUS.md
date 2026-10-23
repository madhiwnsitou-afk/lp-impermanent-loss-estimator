# Solution status

## Built and verified

- Runnable Node service with the exact bounty input/output field names.
- Constant-product, 2–8 asset fixed-weight, and fixed-range V3 principal math. Excess deposits remain idle rather than being silently sold.
- Automatic Ethereum Uniswap V2 history with canonical factory registration checks, finalized reads, historical events, gross fee APR and explicit token-denominated values.
- 27 passing tests, including 500 randomized reserve-equation comparisons, real event-ledger reconstruction, deliberate missing-data rejection and actual x402 SDK routing.
- A real one-hour USDC/WETH capture: 32 swaps, four evaluation windows, exact raw reserve/supply reconciliation. Maximum withdrawal-value reconstruction error: approximately 4.4e-14 percent (floating-point rounding).
- A fresh six-minute live provider smoke check also passed: 10 swaps and exact end-state reconciliation. See `evidence/live-smoke.json`.
- Locked dependency install (`npm ci`) passed. Saved dependency audit reports zero known vulnerabilities at the time it ran.

The historical result validates retrospective accounting of those observations. It does not prove price prediction, future returns, or universal accuracy across AMMs. The raw LP supply is anchored to finalized totalSupply and rolled through observed mint/burn Transfer events; it is not independently queried at each historical block. Weighted/V3 testing is mathematical and synthetic, not realized historical position evidence.

## Outstanding before a truthful completed bounty claim

1. Public HTTPS deployment using the user's public payment receiving address and a compatible facilitator.
2. A successful live paid x402 request. Current paid success/failure tests use an injected facilitator double; no funds moved.
3. Confirmation of the sponsor's undefined <10% benchmark metric and mandatory AMM coverage; independent weighted/V3 position history if required.
4. User-controlled Solana payout address and published source/deployment URLs for the submission.
5. Sponsor confirmation that the reward remains available. The issue is open but already has multiple submissions; no payment eligibility is assumed.

No bounty claim, pull request, public deployment, payment or external message was sent. The draft submission deliberately leaves incomplete claims unchecked.
