import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";

import "@openzeppelin/hardhat-upgrades";

import { config as dotenvConfig } from "dotenv";

dotenvConfig();

["DEPLOYER_PRIVATE_KEY"].forEach((key) => {
  if (process.env[key] == null) {
    console.log("\x1b[33m%s\x1b[0m", `[warning] process.env.${key} is not set`);
  }
});

const { DEPLOYER_PRIVATE_KEY } = process.env;
const accounts =
  DEPLOYER_PRIVATE_KEY == null ? undefined : [DEPLOYER_PRIVATE_KEY];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{ version: "0.7.3" }, { version: "0.8.3" }],
  },

  networks: {
    // BSC testnet
    bnbt: {
      chainId: 97,
      url: `https://data-seed-prebsc-1-s1.binance.org:8545/`,
      accounts,
    },
    // Godwoken devnet
    gwkd: {
      chainId: 3,
      url: "http://localhost:8024",
      accounts,
    },
  },
};

export default config;
