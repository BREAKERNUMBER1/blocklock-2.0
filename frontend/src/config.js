/**
 * BlockLock-LitVM frontend configuration.
 * Verify these network params yourself at testnet.litvm.com before relying
 * on them — LitVM Liteforge is a new chain and details can shift.
 */

export const NETWORK = {
  id: 4441,
  name: "LitVM Liteforge Testnet",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrl: import.meta.env.VITE_LITVM_RPC || "https://liteforge.rpc.caldera.xyz/infra-partner-http",
  explorerUrl: "https://liteforge.explorer.caldera.xyz",
};

export const CONTRACTS = {
  // Filled in after running: npm run deploy:liteforge in /contracts
  UNLOCK: import.meta.env.VITE_UNLOCK_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
};

export const API_BASE = import.meta.env.VITE_API_URL || "/api";

// WalletConnect project ID — get free at cloud.walletconnect.com
export const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "YOUR_WALLETCONNECT_PROJECT_ID";

export const UNLOCK_ABI = [
  {
    name: "unlock",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "doorId", type: "string" }],
    outputs: [],
  },
  {
    name: "unlockPriceWei",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];
