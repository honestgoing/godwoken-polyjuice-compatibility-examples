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

export interface IUpgradeProxyArgs {
  adminAddress: string;
  proxyAddress: string;
  implementationName: string;
  proxyName: string;
  implementationFactory: ContractFactory;
}

export interface IUpgradeProxyOptions {
  initializer?: string;
  initializerArgs?: unknown[];
  signer?: Wallet;
  proxyAdminID?: string;
  useOVM?: boolean;
  gasPrice?: number;
  gasLimit?: number;
}

export async function upgradeProxy(
  {
    adminAddress,
    proxyAddress,
    implementationName,
    proxyName,
    implementationFactory,
  }: IUpgradeProxyArgs,
  {
    initializer = "",
    initializerArgs,
    signer = defaultSigner,
    useOVM = false,
    gasPrice,
    gasLimit,
  }: IUpgradeProxyOptions = {},
): Promise<{ implementationAddress: string }> {
  const ProxyAdmin = useOVM ? ProxyAdminOVM : ProxyAdminEVM;

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `upgrades${networkSuffix ? `-${networkSuffix}` : ""}.json`,
  );
  let receipt: providers.TransactionReceipt;

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy ${implementationName} implementation`,
    () => {
      const tx = implementationFactory.getDeployTransaction();
      if (gasPrice != null) {
        tx.gasPrice = gasPrice;
      }
      if (gasLimit != null) {
        tx.gasLimit = gasLimit;
      }
      return signer.sendTransaction(tx);
    },
  );

  const implementationAddress = receipt.contractAddress;
  console.log(
    `    ${implementationName} implementation address:`,
    implementationAddress,
  );

  const proxyAdmin = new Contract(
    adminAddress,
    ProxyAdmin.abi,
    signer,
  ) as IProxyAdmin;
  receipt = await transactionSubmitter.submitAndWait(
    `Upgrade ${proxyName} to use ${implementationName}`,
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
