# BlockLock-LitVM — Architecture

How the pieces fit together, why each trust boundary is checked the way it is, and where the current implementation falls short of the design intent. For "how do I run this," see [`litvm-deployment.md`](litvm-deployment.md). For wiring, see [`wiring.md`](wiring.md).

This project is a **separate codebase from the original [BlockLock](https://github.com/BREAKERNUMBER1/blocklock)**, not a fork tracked in the same repo. It shares design lineage (same firmware pattern, same mempool-validation approach, same audit-log shape) but runs on a different chain, against a different contract, with a different trust model. Don't mix config, addresses, or secrets between the two.

## Components

```
┌────────────┐     ┌────────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────┐     ┌────────┐
│  Wallet    │────▶│  Frontend  │────▶│ PayToUnlock  │────▶│  Backend   │────▶│  MQTT    │────▶│ ESP32  │
│ (MetaMask) │     │ React+wagmi│     │ (LitVM chain)│     │  Express   │     │Mosquitto │     │Firmware│
└────────────┘     └────────────┘     └──────┬───────┘     └─────┬──────┘     └──────────┘     └───┬────┘
                                              │                    │                                 │
                                              ▼                    ▼                                 ▼
                                        ┌───────────┐        ┌────────────┐                    ┌───────────┐
                                        │ Treasury  │        │  SQLite    │                    │   Relay   │
                                        │ Ops fund  │        │ audit log  │                    │  → Lock   │
                                        └───────────┘        └────────────┘                    └───────────┘
```

- **Frontend** (`frontend/`) — React SPA. Reads the live unlock price off-chain, drives the wallet payment, submits the resulting tx hash to the backend. Holds no secrets.
- **PayToUnlock contract** (`contracts/contracts/PayToUnlock.sol`) — the only place funds move. `unlock(doorId)` requires `msg.value >= unlockPriceWei`, splits the payment 90% treasury / 10% operations fund atomically, and emits `Unlocked(payer, doorId, amount, timestamp)`. Owner-only setters exist for price and payout addresses.
- **Backend** (`backend/`) — holds the only secrets (MQTT HMAC secret, RPC access) and is the only component trusted to command a physical unlock. Unlike the original BlockLock, it does **not** hold a JWT secret — there's no session step, because there's no identity step.
- **MQTT broker** — Mosquitto over TLS, a dumb authenticated pipe; never validates unlock authorization itself.
- **Firmware** (`firmware/blocklock_main/blocklock_main.ino`) — trusts exactly one thing: a valid HMAC over the MQTT payload. Same firmware pattern as the original BlockLock, carried over unmodified apart from the WiFi-scan diagnostics added during bring-up.

## Request flow

1. **Frontend reads `unlockPriceWei()`** directly off the `PayToUnlock` contract — the price is on-chain, not hardcoded client-side, so it can be retuned (`setUnlockPrice`, owner-only) without a redeploy.
2. **Wallet calls `unlock(doorId)`** with `msg.value` ≥ the current price. This *is* the entire authentication step — no signature, no login. The contract itself enforces the price floor and does the 90/10 split atomically in the same transaction (`operationsFund.call{value:...}` then `treasury.call{value:...}`, both required to succeed or the whole call reverts).
3. **`POST /api/submit-tx`** (`unlockRouter.js`) — backend first checks `findByTxHash(txHash)` against the audit DB; if this hash was already processed, it's rejected outright (idempotency — stops a single confirmed payment being resubmitted for a second free unlock).
4. **`validateMempoolTx`** (`blockchain.js`) then:
   - confirms the tx exists (`getTransaction`)
   - confirms `tx.to` is the `PayToUnlock` contract address
   - decodes the calldata as `unlock(doorId)` and confirms the doorId matches what was requested
   - reads the *current* `unlockPriceWei()` from the contract (not a cached/client-supplied value) and confirms `tx.value` meets it
   Notably: **no `from`-address check** exists or is needed — whoever's transaction pays enough unlocks the door, matching the "payment is the credential" model.
5. **Backend publishes** an HMAC-signed unlock command over MQTT and logs a `tx_pending` row.
6. **ESP32** recomputes the HMAC over the reconstructed body and pulses the relay only on a match.
7. **Backend monitors the tx** in the background (~12s polling) and updates the audit row to confirmed/failed — same pattern as the original project: the door already opened on mempool evidence, and a later revert is a follow-up case, not a "let someone in for free" case, since the relay only pulsed after the mempool check passed.

## Trust boundaries

| Boundary | Enforced by | What it stops |
|---|---|---|
| Wallet ↔ Contract (payment floor) | `require(msg.value >= unlockPriceWei)` on-chain | Paying less than the current price |
| Contract ↔ Payout addresses | Atomic dual transfer + `ReentrancyGuard` | Funds partially lost or drained via reentrancy if either payout leg fails |
| Wallet ↔ Backend (payment validity) | Mempool tx decode: contract, calldata doorId, value vs. live on-chain price | Faking a payment, targeting the wrong door, paying too little |
| Backend ↔ Backend (idempotency) | Unique index on `tx_hash` in the audit DB | Replaying one confirmed payment into two unlocks |
| Backend ↔ MQTT broker ↔ Firmware | HMAC-SHA256 over the unlock payload | Anyone with just broker credentials forging an unlock command |
| Backend ↔ Firmware (freshness) | ESP32 NTP-syncs at boot, rejects commands older than `MAX_COMMAND_AGE_SECONDS`, and dedupes accepted nonces in a ring buffer (`blocklock_main.ino`) | A captured, validly-signed unlock message being replayed later |

## Known limitations / roadmap

1. **`wifiClient.setInsecure()` is the firmware default** — TLS cert verification is off unless the CA-cert steps in `litvm-deployment.md` are followed.
2. **Rate limiting is dev-tuned** (`rateLimiter.js` — 50 requests/min/IP, explicitly commented as relaxed for testing).
3. **Shared WalletConnect/Reown project ID with the original BlockLock app** — cosmetic (wallet-connect popup branding), but should be split before this is shown to an external audience, since it undercuts the "separate project" framing.

## Why payment-as-gate instead of NFT-as-gate

The original BlockLock proves *identity* (do you hold this specific NFT) before granting access. This variant deliberately drops that layer and asks a simpler question: *is a sufficient payment, right now, real* — closer to a vending machine or a parking meter than an access-control system. Two consequences worth calling out:

- **Simpler trust surface.** There's no signature step, no session token, no NFT-ownership RPC call — fewer moving parts to get wrong, and the mempool-validation step (already the hardest-won piece of the original project) is the *only* thing standing between "anyone can call `unlock()`" and "the door opens." That's also exactly why command-freshness/replay protection matters more here than in the identity-gated version — payment being the sole gate is precisely why it's enforced in firmware rather than left as a documented-but-unimplemented gap.
- **On-chain payout logic instead of backend custody.** The 90/10 split happens inside the `unlock()` call itself, atomically, rather than the backend receiving funds and disbursing them later. That removes an entire class of "backend holds money it shouldn't" risk, at the cost of the payout addresses being fixed at deploy time (or owner-updatable, which is its own trust assumption — see `setTreasury`/`setOperationsFund`, currently still callable by the throwaway deployer key pending Step 8 of the deployment doc).
