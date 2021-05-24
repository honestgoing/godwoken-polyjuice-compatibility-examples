import { Contract, Overrides, providers, Wallet } from "ethers";

import { networkSuffix, deployer as defaultSigner } from "../common";
import { TransactionSubmitter } from "../TransactionSubmitter";

import ProxyAdminEVM from "./generated-artifacts/ProxyAdmin.json";
import ProxyAdminOVM from "./generated-artifacts/ProxyAdmin.ovm.json";

interface IProxyAdmin extends Contract {
  transferOwnership(
    newOwner: string,
    overrides?: Overrides,
  ): Promise<providers.TransactionResponse>;
}

export interface ITransferProxyAdminOwnershipArgs {
  proxyAdminID: string;
  newOwnerAddress: string;
}

export interface ITransferProxyAdminOwnershipOptions {
  signer?: Wallet;
  useOVM?: boolean;
  gasPrice?: number;
  gasLimit?: number;
}

export async function transferProxyAdminOwnership(
  { proxyAdminID, newOwnerAddress }: ITransferProxyAdminOwnershipArgs,
  {
    signer = defaultSigner,
    useOVM = false,
    gasPrice,
    gasLimit,
  }: ITransferProxyAdminOwnershipOptions = {},
): Promise<void> {
  const ProxyAdmin = useOVM ? ProxyAdminOVM : ProxyAdminEVM;

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `upgrades${networkSuffix ? `-${networkSuffix}` : ""}.json`,
  );
  const proxyAdminReceipt = transactionSubmitter.getReceipt(
    `Deploy proxy admin(${proxyAdminID})`,
  );
  if (proxyAdminReceipt == null) {
    throw new Error(`ProxyAdmin(${proxyAdminID}) not found`);
  }

  const proxyAdmin = new Contract(
    proxyAdminReceipt.contractAddress,
    ProxyAdmin.abi,
    signer,
  ) as IProxyAdmin;
  await transactionSubmitter.submitAndWait(
    `Transfer ProxyAdmin(${proxyAdminID}) ownership to ${newOwnerAddress}`,
    () => {
      return proxyAdmin.transferOwnership(newOwnerAddress, {
        gasPrice,
        gasLimit,
      });
    },
  );
}
