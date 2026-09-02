const hre = require("hardhat");

async function main() {
  const contractAddress = process.env.UNLOCK_CONTRACT_ADDRESS;
  const newOwner = process.env.NEW_OWNER;

  if (!contractAddress || !newOwner) {
    throw new Error(
      "Set UNLOCK_CONTRACT_ADDRESS and NEW_OWNER in .env before running this script."
    );
  }

  const contract = await hre.ethers.getContractAt("PayToUnlock", contractAddress);
  const currentOwner = await contract.owner();

  console.log(`Contract:      ${contractAddress}`);
  console.log(`Current owner: ${currentOwner}`);
  console.log(`New owner:     ${newOwner}`);

  const tx = await contract.transferOwnership(newOwner);
  await tx.wait();

  console.log(`\nOwnership transferred. ${currentOwner} no longer has owner privileges.`);
  console.log(`Only ${newOwner} can now call setUnlockPrice / setTreasury / setOperationsFund.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
