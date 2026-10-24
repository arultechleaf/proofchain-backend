import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("🚀 Deploying DeliveryProofRegistry...\n");

  const [deployer] = await ethers.getSigners();
  console.log(`  Deployer address : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Deployer balance : ${ethers.formatEther(balance)} ETH\n`);

  // Grant authorization to the deployer by default.
  // In production, pass Company A, B, and Auditor backend signing keys.
  const initialAuthorized: string[] = [deployer.address];

  const Factory = await ethers.getContractFactory("DeliveryProofRegistry");
  const contract = await Factory.deploy(initialAuthorized);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx = contract.deploymentTransaction();

  console.log(`✅ DeliveryProofRegistry deployed!`);
  console.log(`  Contract address : ${address}`);
  console.log(`  Transaction hash : ${tx?.hash}`);
  console.log(`  Block number     : ${tx?.blockNumber ?? "pending"}\n`);

  // ── Persist deployment info for the backend to consume ────────────────────
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    contractName: "DeliveryProofRegistry",
    contractAddress: address,
    deployerAddress: deployer.address,
    transactionHash: tx?.hash,
    chainId: Number(network.chainId),
    networkName: network.name,
    deployedAt: new Date().toISOString(),
  };

  // Write to blockchain/deployment.json
  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`📄 Deployment info saved to: ${deploymentPath}`);

  // Also write into the backend config directory if it exists
  const backendConfigPath = path.join(
    __dirname,
    "../../backend/src/blockchain/contract-config.json"
  );
  const backendConfigDir = path.dirname(backendConfigPath);
  if (fs.existsSync(backendConfigDir)) {
    fs.writeFileSync(backendConfigPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`📄 Deployment info also saved to: ${backendConfigPath}`);
  }

  // Write ABI
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/DeliveryProofRegistry.sol/DeliveryProofRegistry.json"
  );
  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abiPath = path.join(__dirname, "../abi/DeliveryProofRegistry.json");
    if (!fs.existsSync(path.dirname(abiPath))) {
      fs.mkdirSync(path.dirname(abiPath), { recursive: true });
    }
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`📄 ABI saved to: ${abiPath}`);
  }

  console.log("\n🎉 Deployment complete!\n");
  console.log("Next steps:");
  console.log(
    `  1. Add CONTRACT_ADDRESS=${address} to your .env file`
  );
  console.log("  2. Set BLOCKCHAIN_MODE=live in your backend .env");
  console.log("  3. Restart the backend server\n");
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});
