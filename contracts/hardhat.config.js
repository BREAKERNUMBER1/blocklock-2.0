require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // LitVM Liteforge testnet — ZK rollup for Litecoin (BitcoinOS + Arbitrum Orbit).
    // Verify current params yourself at testnet.litvm.com before funding the
    // deployer wallet; this chain is new and details can shift.
    liteforge: {
      url: process.env.LITVM_RPC || "https://liteforge.rpc.caldera.xyz/infra-partner-http",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      chainId: 4441,
    },
  },
};
