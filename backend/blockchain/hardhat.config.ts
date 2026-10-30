import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BESU_RPC_URL = process.env.BESU_RPC_URL || "http://localhost:8545";
const BESU_CHAIN_ID = parseInt(process.env.BESU_CHAIN_ID || "1337");
// Hardhat Account #0 private key — for local dev only; NEVER use in production
const SIGNER_PRIVATE_KEY =
  process.env.BESU_SIGNER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: BESU_CHAIN_ID,
    },
    // Local Hardhat node (npx hardhat node)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: BESU_CHAIN_ID,
    },
    // Hyperledger Besu local development network
    besu_local: {
      url: BESU_RPC_URL,
      chainId: BESU_CHAIN_ID,
      accounts: [SIGNER_PRIVATE_KEY],
      gasPrice: 0,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
