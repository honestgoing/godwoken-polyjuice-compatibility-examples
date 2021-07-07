import { ethers } from "ethers";
import { PolyjuiceWallet, PolyjuiceConfig } from "@polyjuice-provider/ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";
import { GodwokerOption } from "@polyjuice-provider/base/lib/util";
import dotenv from "dotenv";
import axios from "axios";
import SimpleToken from "./artifacts/contracts/MintableToken.sol/MintableToken.json";
import WalletSimple from "./artifacts/contracts/WalletSimple.sol/WalletSimple.json";
import { AbiItems } from "@polyjuice-provider/base/lib/abi";
import path from "path";

dotenv.config({
  path: path.resolve(process.env.ENV_PATH ?? "./.env"),
});
axios.defaults.withCredentials = true;

const { DEPLOYER_PRIVATE_KEY, NETWORK_SUFFIX, GODWOKEN_API_URL } = process.env;
if (DEPLOYER_PRIVATE_KEY == null) {
  console.log("process.env.DEPLOYER_PRIVATE_KEY is required");
  process.exit(1);
}

const godwokerOption: GodwokerOption = {
  godwoken: {
    rollup_type_hash: process.env.ROLLUP_TYPE_HASH!,
    eth_account_lock: {
      code_hash: process.env.ETH_ACCOUNT_LOCK_CODE_HASH!,
      hash_type: "type",
    },
  },
};
export const token_rpc = new PolyjuiceJsonRpcProvider(
  godwokerOption,
  SimpleToken.abi as AbiItems,
  process.env.RPC_URL,
);
export const polyjuiceRPC = new PolyjuiceJsonRpcProvider(
  godwokerOption,
  WalletSimple.abi as AbiItems,
  process.env.RPC_URL,
);
const polyjuice_config: PolyjuiceConfig = {
  godwokerOption: godwokerOption,
  web3RpcUrl: process.env.RPC_URL!,
  abiItems: WalletSimple.abi as AbiItems,
};
const token_polyjuice_config: PolyjuiceConfig = {
  godwokerOption: godwokerOption,
  web3RpcUrl: process.env.RPC_URL!,
  abiItems: SimpleToken.abi as AbiItems,
};
export const polyjuiceDeployer = new PolyjuiceWallet(
  DEPLOYER_PRIVATE_KEY,
  polyjuice_config,
  polyjuiceRPC,
);
export const token_deployer = new PolyjuiceWallet(
  DEPLOYER_PRIVATE_KEY,
  token_polyjuice_config,
  token_rpc,
);

export const defaultRPC = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL,
);
export const defaultDeployer = new ethers.Wallet(
  DEPLOYER_PRIVATE_KEY,
  defaultRPC,
);

export const networkSuffix = NETWORK_SUFFIX;
export const isGodwokenDevnet = networkSuffix === "gwk-devnet";

export async function initGWKAccountIfNeeded(account: string, usingRPC = rpc) {
  const balance = await usingRPC.getBalance(account);
  if (balance.gt(0)) {
    return;
  }

  if (!isGodwoken) {
    console.log(`[warn] account(${account}) balance is 0`);
    return;
  }

  if (networkSuffix !== "gwk-devnet") {
    throw new Error(
      `Please initialize godwoken account for ${account} by deposit first`,
    );
  }

  console.log(`Running: Initialize Godwoken account for ${account} by deposit`);

  if (GODWOKEN_API_URL == null) {
    throw new Error("process.env.GODWOKEN_API_URL is required");
  }

  console.log("    It may take a few minutes...");

  let res = await axios.get(`${GODWOKEN_API_URL}/deposit`, {
    params: {
      eth_address: account,
    },
  });

  if (res.data.status !== "ok") {
    console.log("    Failed to deposit, res:", res);
    throw new Error();
  }

  console.log(`    Initialized, id:`, res.data.data.account_id);
}

export const isGodwoken = networkSuffix?.startsWith("gwk");
export const rpc = isGodwoken ? polyjuiceRPC : defaultRPC;
export const deployer = isGodwoken ? polyjuiceDeployer : defaultDeployer;
