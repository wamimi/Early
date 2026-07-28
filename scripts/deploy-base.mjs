import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  getAddress,
  id,
} from "ethers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function artifact(contractName) {
  const file = resolve(
    root,
    `contracts/base/out/${contractName}.sol/${contractName}.json`
  );
  return JSON.parse(await readFile(file, "utf8"));
}

async function deploy() {
  const provider = new JsonRpcProvider(required("BASE_RPC_URL"));
  const signer = new Wallet(required("BASE_DEPLOYER_PRIVATE_KEY"), provider);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 84532) {
    throw new Error(`Expected Base Sepolia (84532), received ${network.chainId}.`);
  }

  const verifier = getAddress(
    process.env.RECLAIM_BASE_VERIFIER_ADDRESS ??
      "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5"
  );
  const bridgeSigner = getAddress(required("EARLY_BRIDGE_SIGNER_ADDRESS"));
  const owner = await signer.getAddress();

  const registryArtifact = await artifact("EarlyDiscoveryRegistry");
  const registryFactory = new ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode.object,
    signer
  );
  const registry = await registryFactory.deploy(verifier, owner);
  await registry.waitForDeployment();

  const providerRules = [
    ["RECLAIM_X_PROVIDER_CONFIGURATION_HASH", id("x")],
    ["RECLAIM_YOUTUBE_PROVIDER_CONFIGURATION_HASH", id("youtube")],
  ];
  for (const [environmentName, platformHash] of providerRules) {
    const providerHash = process.env[environmentName];
    if (!providerHash) continue;
    const transaction = await registry.setProviderConfiguration(
      providerHash,
      platformHash,
      2,
      true
    );
    await transaction.wait();
  }

  const claimsArtifact = await artifact("CampaignClaims");
  const claimsFactory = new ContractFactory(
    claimsArtifact.abi,
    claimsArtifact.bytecode.object,
    signer
  );
  const claims = await claimsFactory.deploy(bridgeSigner, owner);
  await claims.waitForDeployment();

  const output = {
    chainId: 84532,
    network: "base-sepolia",
    reclaimVerifier: verifier,
    earlyDiscoveryRegistry: await registry.getAddress(),
    campaignClaims: await claims.getAddress(),
    deployedAt: new Date().toISOString(),
    deployer: owner,
  };
  await writeFile(
    resolve(root, "contracts/base/deployments/base-sepolia.json"),
    `${JSON.stringify(output, null, 2)}\n`
  );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

deploy().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
