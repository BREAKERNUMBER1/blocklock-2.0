/**
 * Core BlockLock-LitVM unlock hook.
 * Orchestrates: fetch price → pay → submit tx → unlock
 * No signature/session step — the on-chain payment itself is the gate.
 */

import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useChainId, useSwitchChain } from "wagmi";
import { api } from "../api/blocklock.js";
import { CONTRACTS, UNLOCK_ABI, NETWORK } from "../config.js";

export const STEPS = {
  IDLE: "idle",
  FETCHING_PRICE: "fetching_price",
  PAYING: "paying",
  SUBMITTING: "submitting",
  UNLOCKED: "unlocked",
  ERROR: "error",
};

export function useBlockLock(doorId) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { refetch: fetchPrice } = useReadContract({
    address: CONTRACTS.UNLOCK,
    abi: UNLOCK_ABI,
    functionName: "unlockPriceWei",
    query: { enabled: false },
  });

  const [step, setStep] = useState(STEPS.IDLE);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const unlock = useCallback(async () => {
    if (!address) return;
    setError(null);
    setTxHash(null);

    // Ensure user is on the correct network
    if (chainId !== NETWORK.id) {
      try {
        await switchChain({ chainId: NETWORK.id });
      } catch {
        setError(`Please switch your wallet to ${NETWORK.name}.`);
        setStep(STEPS.ERROR);
        return;
      }
    }

    try {
      // Step 1: Read the current unlock price from the contract
      setStep(STEPS.FETCHING_PRICE);
      const { data: priceWei, error: priceErr } = await fetchPrice();
      if (priceErr || priceWei === undefined) {
        setError("Unable to read the current unlock price. Try again.");
        setStep(STEPS.ERROR);
        return;
      }

      // Step 2: Send payment to the PayToUnlock contract
      setStep(STEPS.PAYING);
      let hash;
      try {
        hash = await writeContractAsync({
          address: CONTRACTS.UNLOCK,
          abi: UNLOCK_ABI,
          functionName: "unlock",
          args: [doorId],
          value: priceWei,
          gas: 150000n,
        });
      } catch (err) {
        if (err.name === "UserRejectedRequestError") {
          setError("Payment rejected. Payment is required to unlock.");
        } else {
          setError(`Payment failed: ${err.shortMessage || err.message}`);
        }
        setStep(STEPS.ERROR);
        return;
      }

      setTxHash(hash);

      // Step 3: Submit tx hash → server validates + signals ESP32
      setStep(STEPS.SUBMITTING);
      await api.submitTx(hash, doorId);

      setStep(STEPS.UNLOCKED);
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
      setStep(STEPS.ERROR);
    }
  }, [address, chainId, doorId, fetchPrice, writeContractAsync, switchChain]);

  const reset = useCallback(() => {
    setStep(STEPS.IDLE);
    setError(null);
    setTxHash(null);
  }, []);

  return { step, error, txHash, unlock, reset };
}
