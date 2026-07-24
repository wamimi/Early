import { ethers } from "hardhat";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const attestor = process.env.EARLY_ATTESTOR_ADDRESS ?? deployer.address;
  const relayer = process.env.EARLY_RELAYER_ADDRESS ?? deployer.address;
  const Factory = await ethers.getContractFactory("EarlyPrivateDiscoveryVault");
  const vault = await Factory.deploy(deployer.address, attestor, relayer);

  await vault.waitForDeployment();

  const deployment = {
    chainId: 11155111,
    network: "ethereum-sepolia",
    earlyPrivateDiscoveryVault: await vault.getAddress(),
    owner: deployer.address,
    attestor,
    trustedRelayer: relayer,
    deployedAt: new Date().toISOString(),
  };
  const directory = resolve(__dirname, "..", "deployments");
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "sepolia.json"),
    `${JSON.stringify(deployment, null, 2)}\n`
  );
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
