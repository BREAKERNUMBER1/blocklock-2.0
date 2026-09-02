import { useAccount, useConnect, useDisconnect } from "wagmi";
import { WalletIcon, LinkIcon } from "../icons.jsx";

const CONNECTOR_ICONS = {
  injected: WalletIcon,
  walletConnect: LinkIcon,
};

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="wallet-pill">
        <span className="wallet-address">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          style={{
            padding: "6px 12px",
            background: "transparent",
            color: "#8b93a7",
            border: "1px solid rgba(148,163,184,0.22)",
            borderRadius: 6,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={{ color: "#8b93a7", fontSize: 14, marginBottom: 18, fontWeight: 500 }}>
        Connect your wallet to continue
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {connectors.map((connector) => {
          const Icon = CONNECTOR_ICONS[connector.id] || WalletIcon;
          return (
            <button
              key={connector.uid}
              className="connector-btn"
              onClick={() => connect({ connector })}
              disabled={isPending}
            >
              <span className="connector-icon">
                <Icon />
              </span>
              {connector.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
