import { providers, Wallet } from "ethers";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();
axios.defaults.withCredentials = true;

const { DEPLOYER_PRIVATE_KEY, NETWORK_SUFFIX, GODWOKEN_API_URL } = process.env;
if (DEPLOYER_PRIVATE_KEY == null) {
  console.log("process.env.DEPLOYER_PRIVATE_KEY is required");
  process.exit(1);
}

export const rpc = new providers.JsonRpcProvider(process.env.RPC_URL);
export const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, rpc);
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
