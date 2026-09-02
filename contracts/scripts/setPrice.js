/**
 * Update the on-chain unlock price to match ~$1 USD worth of zkLTC.
 *
 * There's no live LTC/USD oracle on LitVM testnet, so this takes a manual
 * quote and computes the wei amount. Look up the current LTC/USD price
 * yourself (e.g. from a reputable exchange) and pass it in:
 *
 *   LTC_USD_PRICE=75.30 TARGET_USD=1 npx hardhat run scripts/setPrice.js --network liteforge
 */
const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.UNLOCK_CONTRACT_ADDRESS;
  const targetUsd = parseFloat(process.env.TARGET_USD || "1");
  const ltcUsdPrice = parseFloat(process.env.LTC_USD_PRICE);

  if (!contractAddress) {
    throw new Error("Set UNLOCK_CONTRACT_ADDRESS in .env");
  }
  if (!ltcUsdPrice || Number.isNaN(ltcUsdPrice)) {
    throw new Error("Pass LTC_USD_PRICE=<current LTC/USD quote>, e.g. LTC_USD_PRICE=75.30");
  }

  // zkLTC is treated as 1:1 with LTC and 18 decimals, same as ETH-style native tokens.
  const zkLtcPerUnlock = targetUsd / ltcUsdPrice;
  const priceWei = hre.ethers.parseEther(zkLtcPerUnlock.toFixed(18));

  const contract = await hre.ethers.getContractAt("PayToUnlock", contractAddress);
  console.log(`Setting unlock price to ${zkLtcPerUnlock} zkLTC (${priceWei} wei) for $${targetUsd}...`);

  const tx = await contract.setUnlockPrice(priceWei);
  await tx.wait();

  console.log(`Done. Tx: https://liteforge.explorer.caldera.xyz/tx/${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
