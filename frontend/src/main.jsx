import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected, walletConnect } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { WALLETCONNECT_PROJECT_ID, NETWORK } from "./config.js";
import "./index.css";

// LitVM Liteforge testnet isn't in wagmi's built-in chain list, so it's
// defined here directly from the params in config.js.
const liteforge = defineChain({
  id: NETWORK.id,
  name: NETWORK.name,
  nativeCurrency: NETWORK.nativeCurrency,
  rpcUrls: {
    default: { http: [NETWORK.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "LitVM Explorer", url: NETWORK.explorerUrl },
  },
});

const wagmiConfig = createConfig({
  chains: [liteforge],
  connectors: [
    injected(), // MetaMask and other injected wallets
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }), // Mobile wallets
  ],
  transports: {
    [liteforge.id]: http(),
  },
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
