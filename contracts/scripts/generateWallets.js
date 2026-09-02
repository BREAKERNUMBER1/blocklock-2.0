/**
 * One-off local wallet generator — run manually, never on a server.
 * Creates three fresh EVM keypairs entirely offline (no network calls):
 *   - deployer:   needs testnet zkLTC from the faucet to pay gas
 *   - treasury:   receives 90% of every unlock payment
 *   - operationsFund: receives 10% of every unlock payment
 *
 * Prints everything once to the terminal and writes nothing to disk.
 * Copy the values into your own .env files and store the private keys
 * yourself — treat this like real custody practice even though it's a
 * testnet.
 *
 * Usage: npm run generate-wallets
 */
const { ethers } = require("ethers");

function printWallet(label, wallet) {
  console.log(`\n${label}`);
  console.log(`  Address:     ${wallet.address}`);
  console.log(`  Private key: ${wallet.privateKey}`);
}

const deployer = ethers.Wallet.createRandom();
const treasury = ethers.Wallet.createRandom();
const operationsFund = ethers.Wallet.createRandom();

console.log("=== Generated 3 fresh wallets (offline, not saved to disk) ===");
printWallet("Deployer (fund via faucet, only needs gas)", deployer);
printWallet("Treasury (90% of every unlock payment)", treasury);
printWallet("Operations fund (10% of every unlock payment)", operationsFund);

console.log(
  "\nCopy these into contracts/.env, backend/.env, frontend/.env as needed. " +
    "Save the private keys somewhere secure outside this terminal, then clear your scrollback."
);
