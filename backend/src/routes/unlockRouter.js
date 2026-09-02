/**
 * POST /api/submit-tx — validate mempool payment tx → publish MQTT unlock → log attempt
 *
 * No prior signature/session step: payment itself is the gate. A confirmed
 * transfer of >= the current unlock price to the PayToUnlock contract is
 * sufficient proof, same trust model as a vending machine.
 */

import { Router } from "express";
import { validateMempoolTx, monitorTx } from "../services/blockchain.js";
import { publishUnlock } from "../services/mqttService.js";
import { logAttempt, updateConfirmation, findByTxHash } from "../services/auditLog.js";
import { notifyUnlock } from "../services/discordNotifier.js";
import { unlockLimiter } from "../middleware/rateLimiter.js";

export const unlockRouter = Router();

unlockRouter.post("/submit-tx", unlockLimiter, async (req, res) => {
  const { txHash, doorId } = req.body;

  if (!txHash || !doorId) {
    return res.status(400).json({ error: "Missing txHash or doorId" });
  }

  // Idempotency — reject replay of a txHash that's already been processed,
  // so an old confirmed payment can't be resubmitted for a free repeat unlock.
  const existing = findByTxHash(txHash);
  if (existing) {
    return res.status(409).json({ error: "This transaction has already been processed." });
  }

  let validation;
  try {
    validation = await validateMempoolTx(txHash, doorId);
  } catch (err) {
    console.error("[SubmitTx] Mempool validation error:", err.message);
    return res.status(503).json({ error: "Unable to validate transaction. Try again." });
  }

  if (!validation.valid) {
    logAttempt({ doorId, wallet: "unknown", txHash, status: "denied", failureReason: validation.reason });
    await notifyUnlock({ doorId, wallet: "unknown", txHash, status: "denied" });
    return res.status(400).json({ error: `Transaction invalid: ${validation.reason}` });
  }

  const wallet = validation.fromAddress;

  // Log as pending — unlock on submission
  const rowId = logAttempt({ doorId, wallet, txHash, status: "tx_pending" });

  // Publish unlock signal to ESP32 via MQTT
  try {
    await publishUnlock(doorId, 5000);
  } catch (err) {
    console.error("[SubmitTx] MQTT publish failed:", err.message);
    updateConfirmation(rowId, false, "MQTT publish failed");
    return res.status(503).json({ error: "Failed to send unlock signal. Contact support." });
  }

  await notifyUnlock({ doorId, wallet, txHash, status: "unlocked" });

  // Monitor tx in background — update audit log and alert on failure
  monitorTx(txHash, {
    onConfirmed: (receipt) => {
      console.log(`[TxMonitor] TX confirmed in block ${receipt.blockNumber}: ${txHash}`);
      updateConfirmation(rowId, true);
    },
    onFailed: (reason) => {
      console.warn(`[TxMonitor] TX FAILED (${txHash}): ${reason}`);
      updateConfirmation(rowId, false, reason);
      notifyUnlock({ doorId, wallet, txHash, status: "tx_failed" });
      console.warn(`[FOLLOW-UP REQUIRED] Wallet ${wallet} — TX ${txHash} — Door ${doorId}`);
    },
  });

  res.json({
    success: true,
    message: "Unlock signal sent. Door will open for 5 seconds.",
    txHash,
  });
});
