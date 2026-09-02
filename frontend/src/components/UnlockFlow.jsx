import { useBlockLock, STEPS } from "../hooks/useBlockLock.js";
import { LockIcon, UnlockIcon, CheckIcon } from "../icons.jsx";

const STEP_LABELS = {
  [STEPS.FETCHING_PRICE]: "Fetching current price...",
  [STEPS.PAYING]: "Approve payment in your wallet...",
  [STEPS.SUBMITTING]: "Sending unlock signal...",
  [STEPS.UNLOCKED]: "Door unlocked!",
};

const STEP_ORDER = [STEPS.FETCHING_PRICE, STEPS.PAYING, STEPS.SUBMITTING, STEPS.UNLOCKED];

export function UnlockFlow({ doorId }) {
  const { step, error, txHash, unlock, reset } = useBlockLock(doorId);
  const isLoading = step !== STEPS.IDLE && step !== STEPS.UNLOCKED && step !== STEPS.ERROR;
  const isUnlocked = step === STEPS.UNLOCKED;
  const currentIndex = STEP_ORDER.indexOf(step);

  const badgeClass = [
    "lock-badge",
    isUnlocked && "lock-badge--unlocked",
    isLoading && "lock-badge--busy",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="scene">
      <div className="glass-card">
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div className={badgeClass}>{isUnlocked ? <UnlockIcon /> : <LockIcon />}</div>
          <h1 className="title">BlockLock-LitVM</h1>
          <p className="subtitle">Door: {doorId}</p>
        </div>

        <div style={{ height: 26 }} />

        {isLoading && (
          <div style={{ marginBottom: 22 }}>
            {STEP_ORDER.slice(0, -1).map((s, i) => {
              const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
              return (
                <div key={s} className="progress-row">
                  <div className={`progress-dot progress-dot--${state}`}>
                    {state === "done" ? <CheckIcon /> : ""}
                  </div>
                  <span
                    className="progress-label"
                    style={{
                      color: state === "active" ? "#f59e0b" : state === "done" ? "#22c55e" : "#565f75",
                      fontWeight: state === "active" ? 600 : 400,
                    }}
                  >
                    {STEP_LABELS[s]}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {isUnlocked && (
          <div className="info-box info-box--success">
            <p style={{ color: "#4ade80", fontSize: 15, marginBottom: txHash ? 8 : 0, fontWeight: 500 }}>
              Access granted. The door will lock again in 5 seconds.
            </p>
            {txHash && (
              <a
                href={`https://liteforge.explorer.caldera.xyz/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#22d3ee", fontSize: 13, textDecoration: "none" }}
              >
                View transaction on LitVM Explorer ↗
              </a>
            )}
          </div>
        )}

        {step === STEPS.ERROR && (
          <div className="info-box info-box--error">
            <p style={{ color: "#f87171", fontSize: 14, lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {(step === STEPS.IDLE || step === STEPS.ERROR) && (
          <button className="btn-primary" onClick={step === STEPS.ERROR ? reset : unlock} disabled={isLoading}>
            {step === STEPS.ERROR ? "Try Again" : "Pay ~$1 to Unlock"}
          </button>
        )}

        {isUnlocked && (
          <button className="btn-secondary" onClick={reset}>
            Back
          </button>
        )}

        {step === STEPS.IDLE && (
          <p className="hint">Pay ~$1 in zkLTC to unlock — no NFT or account required</p>
        )}
      </div>
    </div>
  );
}
