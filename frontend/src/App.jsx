import { useAccount } from "wagmi";
import { WalletConnect } from "./components/WalletConnect.jsx";
import { UnlockFlow } from "./components/UnlockFlow.jsx";
import { LockIcon } from "./icons.jsx";

// doorId comes from the URL query string — e.g. ?door=door_001
// This allows the same dApp to serve multiple doors.
function getDoorId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("door") || "door_001";
}

function Background() {
  return (
    <div className="bg-scene">
      <div className="bg-orb bg-orb--a" />
      <div className="bg-orb bg-orb--b" />
      <div className="bg-orb bg-orb--c" />
      <div className="bg-grid" />
    </div>
  );
}

export default function App() {
  const { isConnected } = useAccount();
  const doorId = getDoorId();

  return (
    <>
      <Background />
      {isConnected ? (
        <UnlockFlow doorId={doorId} />
      ) : (
        <div className="scene">
          <div className="glass-card">
            <div className="lock-badge">
              <LockIcon />
            </div>
            <h1 className="title">BlockLock-LitVM</h1>
            <p className="subtitle">Door: {doorId}</p>
            <div style={{ height: 28 }} />
            <WalletConnect />
          </div>
        </div>
      )}
    </>
  );
}
