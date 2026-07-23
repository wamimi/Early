import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = [
  {
    artifact:
      "contracts/base/out/EarlyDiscoveryRegistry.sol/EarlyDiscoveryRegistry.json",
    output: "contracts/base/abi/EarlyDiscoveryRegistry.json",
  },
  {
    artifact: "contracts/base/out/CampaignClaims.sol/CampaignClaims.json",
    output: "contracts/base/abi/CampaignClaims.json",
  },
  {
    artifact:
      "contracts/zama-private-receipt/artifacts/contracts/EarlyPrivateDiscoveryVault.sol/EarlyPrivateDiscoveryVault.json",
    output:
      "contracts/zama-private-receipt/abi/EarlyPrivateDiscoveryVault.json",
  },
];

for (const contract of contracts) {
  const artifact = JSON.parse(
    await readFile(resolve(root, contract.artifact), "utf8")
  );
  const output = resolve(root, contract.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(artifact.abi, null, 2)}\n`);
}
