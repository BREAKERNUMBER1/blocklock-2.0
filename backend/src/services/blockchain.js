/**
 * Blockchain service — LitVM Liteforge RPC via ethers.js.
 * Handles: mempool tx validation against the PayToUnlock contract, tx confirmation monitoring.
 */

import { ethers } from "ethers";

const UNLOCK_ABI = [
  "function unlock(string doorId) payable",
  "function unlockPriceWei() view returns (uint256)",
];

let provider;

export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(process.env.LITVM_RPC);
  }
  return provider;
}

function getUnlockContract() {
  return new ethers.Contract(process.env.UNLOCK_CONTRACT_ADDRESS, UNLOCK_ABI, getProvider());
}

/**
 * Validates a transaction in the mempool before triggering unlock.
 * Checks:
 *   1. Tx exists in mempool (not fake)
 *   2. Tx is calling the PayToUnlock contract
 *   3. Calldata decodes to unlock(doorId) with the matching doorId
 *   4. Tx value meets the current on-chain unlock price
 *
 * No wallet identity check — payment itself is the gate, same trust model
 * as a vending machine. Whoever's transaction pays enough unlocks the door.
 */
export async function validateMempoolTx(txHash, doorId) {
  const p = getProvider();
  const tx = await p.getTransaction(txHash);

  if (!tx) {
    return { valid: false, reason: "Transaction not found in mempool" };
  }

  const contractAddress = process.env.UNLOCK_CONTRACT_ADDRESS.toLowerCase();
  if (!tx.to || tx.to.toLowerCase() !== contractAddress) {
    return { valid: false, reason: "Transaction is not to the PayToUnlock contract" };
  }

  const iface = new ethers.Interface(UNLOCK_ABI);
  let decoded;
  try {
    decoded = iface.decodeFunctionData("unlock", tx.data);
  } catch {
    return { valid: false, reason: "Transaction is not a call to unlock()" };
  }

  const txDoorId = decoded[0];
  if (txDoorId !== doorId) {
    return { valid: false, reason: `Transaction doorId "${txDoorId}" does not match requested door "${doorId}"` };
  }

  let unlockPriceWei;
  try {
    unlockPriceWei = await getUnlockContract().unlockPriceWei();
  } catch (err) {
    return { valid: false, reason: `Unable to read current unlock price: ${err.message}` };
  }

  if (tx.value < unlockPriceWei) {
    return {
      valid: false,
      reason: `Payment too low: ${ethers.formatEther(tx.value)} zkLTC sent, ${ethers.formatEther(unlockPriceWei)} required`,
    };
  }

  return { valid: true, fromAddress: tx.from };
}

/**
 * Monitors a submitted transaction until it is confirmed or fails.
 * Calls onConfirmed(receipt) or onFailed(reason) when settled.
 * Non-blocking — runs in the background.
 */
export function monitorTx(txHash, { onConfirmed, onFailed }) {
  const p = getProvider();
  const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const start = Date.now();

  const poll = async () => {
    if (Date.now() - start > TIMEOUT_MS) {
      onFailed("Transaction monitoring timed out after 10 minutes");
      return;
    }

    try {
      const receipt = await p.getTransactionReceipt(txHash);
      if (receipt === null) {
        // Still pending
        setTimeout(poll, 12_000);
        return;
      }

      if (receipt.status === 1) {
        onConfirmed(receipt);
      } else {
        onFailed("Transaction reverted on-chain");
      }
    } catch (err) {
      console.error("[TxMonitor] Poll error:", err.message);
      setTimeout(poll, 15_000);
    }
  };

  setTimeout(poll, 5_000); // first check after 5s
}
