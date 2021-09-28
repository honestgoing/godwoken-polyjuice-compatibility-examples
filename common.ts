import { ethers } from "ethers";
import {
  PolyjuiceWallet,
  PolyjuiceJsonRpcProvider,
} from "@polyjuice-provider/ethers";
import { PolyjuiceConfig } from "@polyjuice-provider/base";
import dotenv from "dotenv";
import axios from "axios";
import { AbiItems } from "@polyjuice-provider/base";
import path from "path";
import { HexString, Script, utils } from "@ckb-lumos/base";

import WalletSimple from "./artifacts/contracts/WalletSimple.sol/WalletSimple.json";

dotenv.config({
  path: path.resolve(process.env.ENV_PATH ?? "./.env"),
});
axios.defaults.withCredentials = true;

const { DEPLOYER_PRIVATE_KEY, NETWORK_SUFFIX, GODWOKEN_API_URL } = process.env;
if (DEPLOYER_PRIVATE_KEY == null) {
  console.log("process.env.DEPLOYER_PRIVATE_KEY is required");
  process.exit(1);
}

export const polyjuiceConfig: PolyjuiceConfig = {
  rollupTypeHash: process.env.ROLLUP_TYPE_HASH!,
  ethAccountLockCodeHash: process.env.ETH_ACCOUNT_LOCK_CODE_HASH!,
  web3Url: process.env.RPC_URL,
};
export const polyjuiceRPC = new PolyjuiceJsonRpcProvider(
  polyjuiceConfig,
  process.env.RPC_URL,
);
export const polyjuiceDeployer = new PolyjuiceWallet(
  DEPLOYER_PRIVATE_KEY,
  polyjuiceConfig,
  polyjuiceRPC,
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

export function ethEoaAddressToGodwokenShortAddress(
  ethAddress: HexString,
): HexString {
  if (!isGodwoken) {
    return ethAddress;
  }

  if (!ethers.utils.isAddress(ethAddress)) {
    throw new Error("eth address format error!");
  }

  const layer2Lock: Script = {
    code_hash: polyjuiceConfig.ethAccountLockCodeHash!,
    hash_type: "type",
    args: polyjuiceConfig.rollupTypeHash + ethAddress.slice(2).toLowerCase(),
  };
  const scriptHash = utils.computeScriptHash(layer2Lock);
  const shortAddress = scriptHash.slice(0, 42);
  return shortAddress;
}

export function create2ContractAddressToGodwokenShortAddress(
  ethAddress: HexString,
): HexString {
  if (!isGodwoken) {
    return ethAddress;
  }

  if (!ethers.utils.isAddress(ethAddress)) {
    throw new Error("eth address format error!");
  }

  const creatorAccountId = Number(process.env.CREATOR_ACCOUNT_ID!);
  const creatorAccountIdLe = u32ToLittleEndian(creatorAccountId);

  const layer2Lock: Script = {
    code_hash: process.env.POLYJUICE_CONTRACT_CODE_HASH!,
    hash_type: "type",
    args:
      polyjuiceConfig.rollupTypeHash +
      creatorAccountIdLe.slice(2) +
      ethAddress.slice(2).toLowerCase(),
  };
  const scriptHash = utils.computeScriptHash(layer2Lock);
  const shortAddress = scriptHash.slice(0, 42);
  return ethers.utils.getAddress(shortAddress);
}

export const isGodwoken = networkSuffix?.startsWith("gwk");
export const rpc = isGodwoken ? polyjuiceRPC : defaultRPC;
export const deployer = isGodwoken ? polyjuiceDeployer : defaultDeployer;

function u32ToLittleEndian(num: number): HexString {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num);
  return `0x${buf.toString("hex")}`;
}

export function unit(n: number): ethers.BigNumber {
  return ethers.constants.WeiPerEther.mul(ethers.BigNumber.from(n * 1e6)).div(
    1e6,
  );
}

export function unitBNToLocaleString(bn: ethers.BigNumber) {
  return (
    bn.div(ethers.constants.WeiPerEther.div(1e9)).toNumber() / 1e9
  ).toLocaleString("en-US");
}
