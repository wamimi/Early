import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig, vars } from "hardhat/config";

const mnemonic = vars.get("MNEMONIC", "");
const sepoliaRpcUrl = vars.get("SEPOLIA_RPC_URL", "");

const networks: HardhatUserConfig["networks"] = {};

if (mnemonic && sepoliaRpcUrl) {
  networks.sepolia = {
    url: sepoliaRpcUrl,
    accounts: {
      mnemonic
    },
    chainId: 11155111
  };
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 800
      },
      viaIR: true
    }
  },
  networks
};

export default config;
