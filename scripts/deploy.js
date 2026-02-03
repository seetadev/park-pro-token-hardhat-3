import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Read contract artifacts
function getContractArtifact(contractName) {
  const artifactPath = path.join(process.cwd(), 'artifacts', 'contracts', `${contractName}.sol`, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

async function main() {
  console.log("🚀 Starting deployment with Hardhat v3...");

  // Get network name from command line arguments
  const args = process.argv;
  const networkIndex = args.indexOf('--network');
  const networkName = networkIndex !== -1 && args[networkIndex + 1] ? args[networkIndex + 1] : 'localhost';
  
  console.log("Network:", networkName);

  // Network configurations
  const networks = {
    localhost: {
      url: 'http://127.0.0.1:8545',
      chainId: 31337,
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
    },
    avalancheFuji: {
      url: process.env.RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc',
      chainId: 43113,
      privateKey: process.env.PRIVATE_KEY
    },
    avalanche: {
      url: process.env.RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
      chainId: 43114,
      privateKey: process.env.PRIVATE_KEY
    },
    calibnet: {
      url: process.env.RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1',
      chainId: 314159,
      privateKey: process.env.PRIVATE_KEY
    },
    'op-sepolia': {
      url: process.env.RPC_URL || 'https://sepolia.optimism.io',
      chainId: 11155420,
      privateKey: process.env.PRIVATE_KEY
    }
  };

  const networkConfig = networks[networkName] || networks.localhost;
  
  console.log("RPC URL:", networkConfig.url);

  // Define the chain based on network configuration
  const chain = defineChain({
    id: networkConfig.chainId,
    name: networkName,
    network: networkName,
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    rpcUrls: {
      default: {
        http: [networkConfig.url],
      },
    },
  });

  // Get account from network configuration
  const privateKey = networkConfig.privateKey;
  if (!privateKey) {
    throw new Error('Private key not found. Please set PRIVATE_KEY in .env file');
  }
  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);

  const publicClient = createPublicClient({
    chain,
    transport: http(networkConfig.url)
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(networkConfig.url)
  });

  console.log("Deploying contracts with account:", account.address);

  // Get contract artifacts
  const pptTokenArtifact = getContractArtifact('PPTToken');
  const medInvoiceArtifact = getContractArtifact('MedInvoiceContract');

  // Deploy PPT Token with 200 million initial supply
  console.log("\n📦 Deploying PPT Token...");
  const pptTokenHash = await walletClient.deployContract({
    abi: pptTokenArtifact.abi,
    bytecode: pptTokenArtifact.bytecode,
    args: [parseEther('200000000')],
  });

  const pptTokenReceipt = await publicClient.waitForTransactionReceipt({ hash: pptTokenHash });
  const pptTokenAddress = pptTokenReceipt.contractAddress;

  console.log("✅ PPT Token deployed at:", pptTokenAddress);

  // Deploy MedInvoiceContract
  console.log("\n📦 Deploying MedInvoiceContract...");
  const medInvoiceHash = await walletClient.deployContract({
    abi: medInvoiceArtifact.abi,
    bytecode: medInvoiceArtifact.bytecode,
    args: [pptTokenAddress],
  });

  const medInvoiceReceipt = await publicClient.waitForTransactionReceipt({ hash: medInvoiceHash });
  const medInvoiceAddress = medInvoiceReceipt.contractAddress;

  console.log("✅ MedInvoiceContract deployed at:", medInvoiceAddress);

  // Get contract details
  const totalSupply = await publicClient.readContract({
    address: pptTokenAddress,
    abi: pptTokenArtifact.abi,
    functionName: 'totalSupply'
  });

  const ownerBalance = await publicClient.readContract({
    address: pptTokenAddress,
    abi: pptTokenArtifact.abi,
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log("\n📊 Deployment Summary:");
  console.log("======================");
  console.log("Network:", networkName);
  console.log("Deployer:", account.address);
  console.log("PPT Token:", pptTokenAddress);
  console.log("MedInvoiceContract:", medInvoiceAddress);
  console.log("Total Supply:", formatEther(totalSupply), "PPT");
  console.log("Owner Balance:", formatEther(ownerBalance), "PPT");

  return {
    pptToken: pptTokenAddress,
    medInvoiceContract: medInvoiceAddress,
    deployer: account.address
  };
}

main()
  .then((addresses) => {
    console.log("\n🎉 Migration to Hardhat v3 completed successfully!");
    console.log("📋 Contract addresses saved for testing");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });