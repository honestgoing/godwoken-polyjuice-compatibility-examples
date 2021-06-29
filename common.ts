import { providers } from "ethers";
import PolyjuiceWallet, { PolyjuiceConfig } from "@retric/test-provider/lib/hardhat/wallet-signer";
import { PolyjuiceJsonRpcProvider } from "@retric/test-provider/lib/hardhat/providers";
import dotenv from "dotenv";
import axios from "axios";
import { GodwokerOption } from "@retric/test-provider/lib/util";
import SimpleToken from "./artifacts/contracts/MintableToken.sol/MintableToken.json";
import WalletSimple from "./artifacts/contracts/WalletSimple.sol/WalletSimple.json";
import { AbiItems } from "@retric/test-provider/lib/abi";

dotenv.config();
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
export const token_rpc = new PolyjuiceJsonRpcProvider(godwokerOption, SimpleToken.abi as AbiItems, process.env.RPC_URL);
export const rpc = new PolyjuiceJsonRpcProvider(godwokerOption, WalletSimple.abi as AbiItems, process.env.RPC_URL);
const polyjuice_config: PolyjuiceConfig = {
  godwokerOption: godwokerOption,
  web3RpcUrl: process.env.RPC_URL!,
  abiItems: WalletSimple.abi as AbiItems
};
const token_polyjuice_config: PolyjuiceConfig = {
  godwokerOption: godwokerOption,
  web3RpcUrl: process.env.RPC_URL!,
  abiItems: SimpleToken.abi as AbiItems
};
export const deployer = new PolyjuiceWallet(DEPLOYER_PRIVATE_KEY, polyjuice_config, rpc);
export const token_deployer = new PolyjuiceWallet(DEPLOYER_PRIVATE_KEY, token_polyjuice_config, token_rpc);
export const networkSuffix = NETWORK_SUFFIX;
export const isGodwokenDevnet = networkSuffix === "gwk-devnet";

export async function initGWKAccountIfNeeded(account: string, usingRPC = rpc) {
  if (!isGodwokenDevnet) {
    return;
  }

  const balance = await usingRPC.getBalance(account);
  if (balance.gt(0)) {
    return;
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
