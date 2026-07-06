import { ethers } from "hardhat";

async function main() {
  const EarlyPrivateTaste = await ethers.getContractFactory("EarlyPrivateTaste");
  const receipt = await EarlyPrivateTaste.deploy();

  await receipt.waitForDeployment();

  console.log(`EarlyPrivateTaste deployed to ${await receipt.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
