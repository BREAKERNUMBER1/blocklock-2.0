const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  const treasury = process.env.TREASURY_WALLET;
  const operationsFund = process.env.OPERATIONS_FUND_WALLET;
  const initialPriceWei = process.env.INITIAL_UNLOCK_PRICE_WEI;

  if (!treasury || !operationsFund || !initialPriceWei) {
    throw new Error(
      "Set TREASURY_WALLET, OPERATIONS_FUND_WALLET, and INITIAL_UNLOCK_PRICE_WEI in .env before deploying. " +
        "Run `npm run generate-wallets` first if you don't have addresses yet."
    );
  }

  console.log(`Deploying to ${network} with account: ${deployer.address}`);
  console.log(`  Treasury (90%):  ${treasury}`);
  console.log(`  Operations fund (10%): ${operationsFund}`);
  console.log(`  Initial price:   ${initialPriceWei} wei`);

  const PayToUnlock = await hre.ethers.getContractFactory("PayToUnlock");
  const contract = await PayToUnlock.deploy(initialPriceWei, treasury, operationsFund);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`\nPayToUnlock deployed: ${address}`);
  console.log(`View on explorer: https://liteforge.explorer.caldera.xyz/address/${address}`);

  console.log("\n--- Copy these into your backend and frontend .env files ---");
  console.log(`UNLOCK_CONTRACT_ADDRESS=${address}`);
  console.log(`VITE_UNLOCK_CONTRACT_ADDRESS=${address}`);

  const newOwner = process.env.NEW_OWNER;
  if (newOwner) {
    console.log(`\nTransferring ownership to ${newOwner}...`);
    const tx = await contract.transferOwnership(newOwner);
    await tx.wait();
    console.log(`Ownership transferred. ${deployer.address} (deployer) no longer has owner privileges.`);
    console.log(`Only ${newOwner} can now call setUnlockPrice / setTreasury / setOperationsFund.`);
  } else {
    console.log(
      `\nNo NEW_OWNER set — deployer (${deployer.address}) remains contract owner. ` +
        `Set NEW_OWNER in .env and re-run \`npm run transfer-ownership:liteforge\` when you're ready to move ` +
        `owner privileges off this throwaway key.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
