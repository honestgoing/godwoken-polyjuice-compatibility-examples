import { ContractFactory, providers, Wallet } from "ethers";

import { getInitializerData } from "./getInitializerData";
import { deployer as defaultSigner, networkSuffix } from "../common";
import { TransactionSubmitter } from "../TransactionSubmitter";

import ProxyAdminEVM from "./generated-artifacts/ProxyAdmin.json";
import TransparentUpgradeableProxyEVM from "./generated-artifacts/AdminUpgradeabilityProxy.json";
import ProxyAdminOVM from "./generated-artifacts/ProxyAdmin.ovm.json";
import TransparentUpgradeableProxyOVM from "./generated-artifacts/TransparentUpgradeableProxy.ovm.json";

export interface IDeployProxyArgs {
  implementationName: string;
  proxyName: string;
  implementationFactory: ContractFactory;
}

export interface IDeployProxyOptions {
  initializer?: string;
  initializerArgs?: unknown[];
  signer?: Wallet;
  proxyAdminID?: string;
  useOVM?: boolean;
  gasPrice?: number;
  gasLimit?: number;
  shouldIgnoreHistory?: boolean;
}

export async function deployProxy(
  { implementationName, proxyName, implementationFactory }: IDeployProxyArgs,
  {
    initializer,
    initializerArgs,
    signer = defaultSigner,
    proxyAdminID = signer.address,
    useOVM = false,
    gasPrice,
    gasLimit,
    shouldIgnoreHistory,
  }: IDeployProxyOptions = {},
): Promise<{
  implementationAddress: string;
  adminAddress: string;
  proxyAddress: string;
}> {
  const ProxyAdmin = useOVM ? ProxyAdminOVM : ProxyAdminEVM;
  const TransparentUpgradeableProxy = useOVM
    ? TransparentUpgradeableProxyOVM
    : TransparentUpgradeableProxyEVM;

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `upgrades${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    shouldIgnoreHistory,
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

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy proxy admin(${proxyAdminID})`,
    () => {
      const factory = new ContractFactory(
        ProxyAdmin.abi,
        ProxyAdmin.bytecode,
        signer,
      );
      const tx = factory.getDeployTransaction();
      if (gasPrice != null) {
        tx.gasPrice = gasPrice;
      }
      if (gasLimit != null) {
        tx.gasLimit = gasLimit;
      }
      return signer.sendTransaction(tx);
    },
  );

  const adminAddress = receipt.contractAddress;
  console.log(`    ProxyAdmin(${proxyAdminID}) address:`, adminAddress);

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy ${proxyName} proxy`,
    () => {
      const factory = new ContractFactory(
        TransparentUpgradeableProxy.abi,
        TransparentUpgradeableProxy.bytecode,
        signer,
      );
      const initializerData = getInitializerData(
        implementationFactory,
        initializer,
        initializerArgs,
      );
      const tx = factory.getDeployTransaction(
        implementationAddress,
        adminAddress,
        initializerData,
      );
      if (gasPrice != null) {
        tx.gasPrice = gasPrice;
      }
      if (gasLimit != null) {
        tx.gasLimit = gasLimit;
      }
      return signer.sendTransaction(tx);
    },
  );

  const proxyAddress = receipt.contractAddress;
  console.log(`    ${proxyName} proxy address:`, proxyAddress);

  return {
    implementationAddress,
    adminAddress,
    proxyAddress,
  };
}
