/**
 * SQLite audit log — records every unlock attempt.
 * Stores wallet, door, timestamp, tx hash, outcome, and failure reason.
 * Used for follow-up on failed/unconfirmed transactions.
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../data/audit.db");

let db;

export async function initAuditLog() {
  const { mkdirSync } = await import("fs");
  mkdirSync(path.join(__dirname, "../../data"), { recursive: true });

  db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS unlock_attempts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   TEXT    NOT NULL,
      door_id     TEXT    NOT NULL,
      wallet      TEXT    NOT NULL,
      tx_hash     TEXT,
      status      TEXT    NOT NULL, -- 'unlocked' | 'tx_pending' | 'tx_failed' | 'denied'
      failure_reason TEXT,
      confirmed   INTEGER DEFAULT 0  -- 1 = on-chain confirmed, 0 = pending/failed
    );
    CREATE INDEX IF NOT EXISTS idx_wallet ON unlock_attempts(wallet);
    CREATE INDEX IF NOT EXISTS idx_status  ON unlock_attempts(status);
    -- Prevents the same confirmed payment tx from ever triggering two unlocks
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash_unique ON unlock_attempts(tx_hash) WHERE tx_hash IS NOT NULL;
  `);
}

/**
 * Returns the existing attempt for a txHash, if one was already logged.
 * Used to reject replay of an already-processed payment.
 */
export function findByTxHash(txHash) {
  if (!db) return null;
  return db.prepare(`SELECT * FROM unlock_attempts WHERE tx_hash = ?`).get(txHash) || null;
}

export function logAttempt({ doorId, wallet, txHash = null, status, failureReason = null }) {
  if (!db) throw new Error("Audit log not initialized");
  const stmt = db.prepare(`
    INSERT INTO unlock_attempts (timestamp, door_id, wallet, tx_hash, status, failure_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    new Date().toISOString(),
    doorId,
    wallet.toLowerCase(),
    txHash,
    status,
    failureReason
  );
  return result.lastInsertRowid;
}

export function updateConfirmation(rowId, confirmed, failureReason = null) {
  if (!db) return;
  db.prepare(`
    UPDATE unlock_attempts SET confirmed = ?, failure_reason = ? WHERE id = ?
  `).run(confirmed ? 1 : 0, failureReason, rowId);
}

export function getPendingTxs() {
  if (!db) return [];
  return db
    .prepare(`SELECT * FROM unlock_attempts WHERE status = 'tx_pending' AND confirmed = 0`)
    .all();
}

export function getFailedTxs() {
  if (!db) return [];
  return db
    .prepare(`SELECT * FROM unlock_attempts WHERE (status = 'tx_failed' OR confirmed = 0) AND tx_hash IS NOT NULL`)
    .all();
}
