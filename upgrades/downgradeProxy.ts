import {
  Contract,
  Overrides,
  providers,
  ContractFactory,
  Wallet,
} from "ethers";

import { getInitializerData } from "./getInitializerData";
import { networkSuffix, deployer as defaultSigner } from "../common";
import { TransactionSubmitter } from "../TransactionSubmitter";

import ProxyAdminEVM from "./generated-artifacts/ProxyAdmin.json";
import ProxyAdminOVM from "./generated-artifacts/ProxyAdmin.ovm.json";

interface IProxyAdmin extends Contract {
  upgrade(
    proxyAddress: string,
    implementationAddress: string,
    overrides?: Overrides,
  ): Promise<providers.TransactionResponse>;
  upgradeAndCall(
    proxyAddress: string,
    implementationAddress: string,
    callData: string,
    overrides?: Overrides,
  ): Promise<providers.TransactionResponse>;
}

export interface IDowngradeProxyArgs {
  adminAddress: string;
  proxyAddress: string;
  implementationName: string;
  proxyName: string;
  implementationFactory: ContractFactory;
}

export interface IDowngradeProxyOptions {
  initializer?: string;
  initializerArgs?: unknown[];
  signer?: Wallet;
  proxyAdminID?: string;
  useOVM?: boolean;
  gasPrice?: number;
  gasLimit?: number;
  shouldIgnoreHistory?: boolean;
}

export async function downgradeProxy(
  {
    adminAddress,
    proxyAddress,
    implementationName,
    proxyName,
    implementationFactory,
  }: IDowngradeProxyArgs,
  {
    initializer = "",
    initializerArgs,
    signer = defaultSigner,
    useOVM = false,
    gasPrice,
    gasLimit,
    shouldIgnoreHistory,
  }: IDowngradeProxyOptions = {},
): Promise<{ implementationAddress: string }> {
  const ProxyAdmin = useOVM ? ProxyAdminOVM : ProxyAdminEVM;

  const upgradesTransactionReceipts = await TransactionSubmitter.loadReceipts(
    `upgrades${networkSuffix ? `-${networkSuffix}` : ""}.json`,
  );

  const implementationReceipt =
    upgradesTransactionReceipts[`Deploy ${implementationName} implementation`];

  if (implementationReceipt == null) {
    throw new Error(`${implementationName} implementation not found`);
  }

  const implementationAddress = implementationReceipt.contractAddress;
  console.log(
    `    ${implementationName} implementation address:`,
    implementationAddress,
  );

  const downgradesTransactionSubmitter =
    await TransactionSubmitter.newWithHistory(
      `downgrades${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      shouldIgnoreHistory,
    );

  const proxyAdmin = new Contract(
    adminAddress,
    ProxyAdmin.abi,
    signer,
  ) as IProxyAdmin;
  await downgradesTransactionSubmitter.submitAndWait(
    `Downgrade ${proxyName} to use ${implementationName} at ${new Date().toLocaleString()}`,
    () => {
      const initializerData = getInitializerData(
        implementationFactory,
        initializer,
        initializerArgs,
      );

      if (initializerData === "0x") {
        return proxyAdmin.upgrade(proxyAddress, implementationAddress, {
          gasPrice,
          gasLimit,
        });
      }

      return proxyAdmin.upgradeAndCall(
        proxyAddress,
        implementationAddress,
        initializerData,
        {
          gasPrice,
          gasLimit,
        },
      );
    },
  );

  return {
    implementationAddress,
  };
}
