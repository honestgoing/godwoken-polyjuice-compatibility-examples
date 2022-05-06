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

import Multicall2 from "../artifacts/contracts/Multicall2.sol/Multicall2.json";
import RevertTest from "../artifacts/contracts/RevertTest.sol/RevertTest.json";

type TCallStatic = Contract["callStatic"];

interface IMulticallStaticMethods extends TCallStatic {
  getEthBalance(address: string, overrides?: CallOverrides): Promise<BigNumber>;
  aggregate(
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[BigNumber, any[]]>;
}

interface IMulticall2StaticMethods extends IMulticallStaticMethods {
  tryAggregate(
    requireSuccess: boolean,
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<any[]>;
  tryBlockAndAggregate(
    requireSuccess: boolean,
    calls: [string, string][],
    overrides?: CallOverrides,
  ): Promise<[string, string, any[]]>;
}

interface IMulticall2 extends Contract, IMulticall2StaticMethods {
  callStatic: IMulticall2StaticMethods;
}

interface IRevertTestStaticMethods extends TCallStatic {
  test(overrides?: CallOverrides): Promise<void>;
}

interface IRevertTest extends Contract, IRevertTestStaticMethods {
  callStatic: IRevertTestStaticMethods;
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
    `multicall2${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Multicall2`,
    () => {
      const implementationFactory = new ContractFactory(
        Multicall2.abi,
        Multicall2.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const multicall2Address = receipt.contractAddress;
  console.log(`    Multicall2 address:`, multicall2Address);

  const multicall2 = new Contract(
    multicall2Address,
    Multicall2.abi,
    deployer,
  ) as IMulticall2;

  console.log("Running: get native balance with Multicall2.getEthBalance");
  console.log(
    "    Balance:",
    (
      await multicall2.callStatic.getEthBalance(deployerGodwokenAddress)
    ).toString(),
  );

  const getEthBalanceCallData = multicall2.interface.encodeFunctionData(
    multicall2.interface.functions["getEthBalance(address)"],
    [deployerGodwokenAddress],
  );

  console.log("Running: get native balance with Multicall2.aggregate");
  console.log(
    "    Balance:",
    BigNumber.from(
      (
        await multicall2.callStatic.aggregate([
          [multicall2Address, getEthBalanceCallData],
        ])
      )[1][0],
    ).toString(),
  );

  console.log("Running: get native balance with Multicall2.tryAggregate");
  console.log(
    "    Balance:",
    BigNumber.from(
      (
        await multicall2.callStatic.tryAggregate(true, [
          [multicall2Address, getEthBalanceCallData],
        ])
      )[0].returnData,
    ).toString(),
  );

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy RevertTest`,
    () => {
      const implementationFactory = new ContractFactory(
        RevertTest.abi,
        RevertTest.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );
  const revertTestAddress = receipt.contractAddress;
  console.log(`    RevertTest address:`, revertTestAddress);

  const revertTest = new Contract(
    revertTestAddress,
    RevertTest.abi,
    deployer,
  ) as IRevertTest;

  const revertTestCallData = multicall2.interface.encodeFunctionData(
    revertTest.interface.functions["test()"],
  );

  try {
    console.log("Running: RevertTest.test() with Multicall2.aggregate");
    await multicall2.callStatic.aggregate([
      [revertTestAddress, revertTestCallData],
    ]);
  } catch (err) {
    handleExpectedRevert(err);
  }

  try {
    console.log("Running: RevertTest.test() with Multicall2.tryAggregate");
    await multicall2.callStatic.tryAggregate(false, [
      [revertTestAddress, revertTestCallData],
    ]);
    console.log("    Done");
  } catch (err) {
    console.log("    [Incompatibility] Should not revert");
    throw new Error(err?.error?.body ?? err);
  }

  try {
    console.log(
      "Running: RevertTest.test() with Multicall2.tryAggregate (require success)",
    );
    await multicall2.callStatic.tryAggregate(true, [
      [revertTestAddress, revertTestCallData],
    ]);
  } catch (err) {
    handleExpectedRevert(err);
  }

  try {
    console.log(
      "Running: Multicall2.tryAggregate([revertTest, getNativeBalance, nonexistentContractCall])",
    );
    const [
      [shouldBeFalse],
      [isGetEthBalanceSuccess, balance],
      [shouldBeFalseToo],
    ] = await multicall2.callStatic.tryAggregate(false, [
      [revertTestAddress, revertTestCallData],
      [multicall2Address, getEthBalanceCallData],
      [constants.AddressZero, revertTestCallData],
    ]);
    if (!isGetEthBalanceSuccess) {
      console.log("    [Incompatibility] Failed to get native balance");
    } else {
      console.log("    Balance:", BigNumber.from(balance).toString());
    }

    if (shouldBeFalse || shouldBeFalseToo) {
      console.log("    [Incompatibility] Expected return: false, got: true");
    }
  } catch (err) {
    console.log("    [Incompatibility] Should not revert");
    throw new Error(err?.error?.body ?? err);
  }

  try {
    console.log(
      "Running: Multicall2.tryAggregate([nonexistentContractCall, getNativeBalance, nonexistentContractCall]",
    );
    await multicall2.callStatic.tryAggregate(false, [
      [constants.AddressZero, revertTestCallData],
      [multicall2Address, getEthBalanceCallData],
      [constants.AddressZero, revertTestCallData],
    ]);
    console.log("    Done");

    console.log(
      "Running: Multicall2.tryAggregate([nonexistentContractCall, nonexistentContractCall]",
    );
    await multicall2.callStatic.tryAggregate(false, [
      [constants.AddressZero, revertTestCallData],
      [constants.AddressZero, revertTestCallData],
    ]);
    console.log("    Done");

    console.log(
      "Running: Multicall2.tryAggregate([nonexistentContractCall, nonexistentContractCall, getNativeBalance]",
    );
    await multicall2.callStatic.tryAggregate(false, [
      [constants.AddressZero, revertTestCallData],
      [constants.AddressZero, revertTestCallData],
      [multicall2Address, getEthBalanceCallData],
    ]);
  } catch (err) {
    console.log("    [Incompatibility] Should not revert");
    throw new Error(err?.error?.body ?? err);
  }
}

function handleExpectedRevert(err: any) {
  if (err?.error?.body == null) {
    throw err;
  }

  const responseBody = JSON.parse(err.error.body);
  const statusType = responseBody?.error?.data?.failed_reason?.status_type;
  if (statusType === "REVERT") {
    console.log("    Reverted as expected");
  } else {
    throw new Error(err.error.body);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
