# BlockLock-LitVM — Deployment Guide

## Overview

```
LitVM Liteforge Testnet → Verify everything works → (LitVM mainnet, expected H2 2026)
```

This project pays for physical door access with native zkLTC on LitVM's
Liteforge testnet — no NFT, no separate token, no wallet-signature login.
Whoever sends a confirmed on-chain payment of at least the current unlock
price to the `PayToUnlock` contract unlocks the door; 90% of that payment
goes to your treasury wallet and 10% to a separate operations fund wallet,
atomically, in the same transaction.

---

## Network parameters

Verify these yourself at **testnet.litvm.com** before funding a wallet —
LitVM Liteforge is a new chain (mainnet targeted H2 2026) and these details
can change:

| Param | Value |
|---|---|
| Chain name | LitVM Liteforge Testnet |
| Chain ID | 4441 (`0x1159`) |
| Native currency | zkLTC |
| RPC URL | `https://liteforge.rpc.caldera.xyz/infra-partner-http` |
| Block explorer | `https://liteforge.explorer.caldera.xyz` |

### Faucet — use the official route only

Claim testnet zkLTC via the Caldera-hosted faucet reachable from
**testnet.litvm.com**'s own "Get testnet tokens" / Caldera Hub link. Do
**not** use third-party "airdrop farming" aggregator sites (airdropalert.com,
airdrops.io, and similar) that show up in search results for "LitVM
airdrop" — those are unofficial SEO content, not run by Litecoin or LitVM,
and connecting a wallet to them is not necessary to get testnet funds.

---

## Step 1: Generate wallets

```bash
cd blocklock-litvm/contracts
npm install
npm run generate-wallets
```

This prints three fresh keypairs — **deployer**, **treasury**, **operationsFund**
— generated entirely offline. Nothing is written to disk. Copy the
addresses/keys somewhere secure, then:

- Fund the **deployer** address with testnet zkLTC from the faucet (it only
  needs enough for gas).
- **treasury** and **operationsFund** never need their private keys used again —
  the contract pushes funds to them. Store those keys as if they were real.

---

## Step 2: Deploy the contract

```bash
cp .env.example .env
# Fill in:
#   DEPLOYER_PRIVATE_KEY  (from Step 1)
#   TREASURY_WALLET       (from Step 1)
#   OPERATIONS_FUND_WALLET (from Step 1)
#   INITIAL_UNLOCK_PRICE_WEI (a starting guess; see Step 6 to tune it to ~$1)

npm run deploy:liteforge
```

Copy the printed `UNLOCK_CONTRACT_ADDRESS` into `backend/.env` and
`frontend/.env`.

The deployer address becomes the contract's `owner` (can call
`setUnlockPrice` / `setTreasury` / `setOperationsFund`). On testnet it's fine to
leave ownership on the throwaway deployer key. Before mainnet, set
`NEW_OWNER` in `.env` to a hardware wallet or multisig address and either
re-run deploy (it transfers automatically when `NEW_OWNER` is set) or run
`npm run transfer-ownership:liteforge` against an already-deployed contract
— see Step 8.

---

## Step 3: Server setup

```bash
# First, point dlb.tech's DNS A record at your server's public IP
# (in your registrar's / DNS provider's dashboard for dlb.tech)

# On your server (Ubuntu 22.04, run as root)
git clone <your-repo> /opt/blocklock-litvm
cd /opt/blocklock-litvm/infra
bash setup.sh dlb.tech

cp /opt/blocklock-litvm-backend/.env.example /opt/blocklock-litvm-backend/.env
nano /opt/blocklock-litvm-backend/.env
# Required fields:
#   LITVM_RPC
#   UNLOCK_CONTRACT_ADDRESS (from Step 2)
#   MQTT_HMAC_SECRET (generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
#   MQTT_PASSWORD (same as what you set during setup.sh)
#   FRONTEND_URL (https://dlb.tech)

pm2 restart blocklock-litvm-api
```

---

## Step 4: Deploy frontend

```bash
cd blocklock-litvm/frontend
cp .env.example .env
# Fill in:
#   VITE_UNLOCK_CONTRACT_ADDRESS
#   VITE_WALLETCONNECT_PROJECT_ID

npm install
npm run build
scp -r dist/. root@YOUR_SERVER_IP:/var/www/blocklock-litvm/
```

---

## Step 5: Program NFC tags & flash the ESP32

Identical to the original BlockLock hardware setup — nothing about the
firmware changed, since the ESP32 only speaks HMAC-signed MQTT and has no
notion of chain or payment model. Follow `docs/wiring.md` and use
`firmware/nfc_writer` / `firmware/blocklock_main` exactly as documented
there, with `DOOR_URL` set to `https://dlb.tech/?door=door_001`.

---

## Step 6: Keep the price near $1

There's no LTC/USD price oracle on LitVM testnet, so the unlock price is a
plain owner-settable value you update yourself:

```bash
cd blocklock-litvm/contracts
LTC_USD_PRICE=<current LTC/USD quote> TARGET_USD=1 \
  npx hardhat run scripts/setPrice.js --network liteforge
```

Run this periodically (e.g. whenever LTC's price moves meaningfully) to
keep the on-chain price tracking roughly $1.

---

## Step 7: End-to-end test

1. Scan the NFC tag (or open the frontend URL directly).
2. Connect a wallet funded with testnet zkLTC, on LitVM Liteforge Testnet.
3. Tap "Pay ~$1 to Unlock" and approve the payment in your wallet.
4. Relay should click and the door should open for 5 seconds.
5. Check the explorer link (or Discord, if configured) — confirm treasury
   received 90% and operationsFund received 10% of the payment.
6. Check the audit log:
   ```bash
   sqlite3 /opt/blocklock-litvm-backend/data/audit.db "SELECT * FROM unlock_attempts;"
   ```
7. Re-submit the same txHash to `/api/submit-tx` and confirm it's rejected
   with "already been processed" — this is the replay-protection check.

---

## Step 8: Transfer contract ownership (do this before mainnet)

The address that deployed the contract permanently keeps owner privileges
(`setUnlockPrice`, `setTreasury`, `setOperationsFund`) until you explicitly
transfer them. A leaked owner key lets an attacker redirect all future
revenue by changing `treasury`/`operationsFund` — treat it as high-privilege.

```bash
cd blocklock-litvm/contracts
# In .env: set NEW_OWNER to a hardware wallet or multisig address
npm run transfer-ownership:liteforge
```

Verify on the explorer that `owner()` now returns the new address, then
retire the old deployer private key — it has no further use.

---

## Adding more doors (scaling)

Same as BlockLock: flash a new ESP32 with a different `DOOR_ID`, program a
new NFC tag with `?door=door_002`, done — the contract, backend, and
frontend all already key off `doorId` per request, no server changes needed.

---

## Checking failed transactions

```bash
sqlite3 /opt/blocklock-litvm-backend/data/audit.db \
  "SELECT wallet, tx_hash, failure_reason, timestamp FROM unlock_attempts WHERE confirmed=0 AND tx_hash IS NOT NULL;"
```

Use the tx hash to look up the transaction on `liteforge.explorer.caldera.xyz`.
