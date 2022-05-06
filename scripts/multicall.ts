import {
  BigNumber,
  CallOverrides,
  Contract,
  ContractFactory,
  constants,
} from "ethers";

import {
  deployer,
  ethEoaAddressToGodwokenShortAddress,
  initGWAccountIfNeeded,
  isGodwoken,
  isGodwokenV0,
  networkSuffix,
} from "../common";

import { TransactionSubmitter } from "../TransactionSubmitter";

import Multicall from "../artifacts/contracts/Multicall.sol/Multicall.json";

type TCallStatic = Contract["callStatic"];

interface IMulticallStaticMethods extends TCallStatic {
  getEthBalance(address: string, overrides?: CallOverrides): Promise<BigNumber>;
  aggregate(
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[BigNumber, any]>;
}

interface IMulticall extends Contract, IMulticallStaticMethods {
  callStatic: IMulticallStaticMethods;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 1_000_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);
  await initGWAccountIfNeeded(deployerAddress);

  let deployerGodwokenAddress = deployerAddress;
  if (isGodwokenV0) {
    deployerGodwokenAddress =
      ethEoaAddressToGodwokenShortAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerGodwokenAddress);
  }

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `multicall${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Multicall`,
    () => {
      const implementationFactory = new ContractFactory(
        Multicall.abi,
        Multicall.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const multicallAddress = receipt.contractAddress;
  console.log(`    Multicall address:`, multicallAddress);

  const multicall = new Contract(
    multicallAddress,
    Multicall.abi,
    deployer,
  ) as IMulticall;

  console.log(
    "Balance:",
    (
      await multicall.callStatic.getEthBalance(deployerGodwokenAddress)
    ).toString(),
  );

  const callData = multicall.interface.encodeFunctionData(
    multicall.interface.functions["getEthBalance(address)"],
    [deployerGodwokenAddress],
  );

  console.log(
    "Balance:",
    BigNumber.from(
      (
        await multicall.callStatic.aggregate([[multicallAddress, callData]])
      )[1][0],
    ).toString(),
  );

  console.log(
    "Expecting 0x:",
    (
      await multicall.callStatic.aggregate([[constants.AddressZero, callData]])
    )[1][0],
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
