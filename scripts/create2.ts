import {
  CallOverrides,
  Contract,
  ContractFactory,
  providers,
  Overrides,
  utils,
  constants,
} from "ethers";

import {
  deployer,
  create2ContractAddressToGodwokenShortAddress,
  initGWKAccountIfNeeded,
  isGodwoken,
  networkSuffix,
} from "../common";

import { TransactionSubmitter } from "../TransactionSubmitter";

import Create2 from "../artifacts/contracts/Create2.sol/Create2.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface ICreate2StaticMethods extends TCallStatic {
  getAddress(salt: string, overrides?: CallOverrides): Promise<string>;
  INIT_CODE_HASH(overrides?: CallOverrides): Promise<string>;
  creationCode(overrides?: CallOverrides): Promise<string>;
  convertETHAddrToGodwokenAddr(ethAddr: string): Promise<string>;
}

interface ICreate2 extends Contract, ICreate2StaticMethods {
  callStatic: ICreate2StaticMethods & {
    create(salt: string, overrides?: CallOverrides): Promise<string>;
  };
  create(salt: string, overrides?: Overrides): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 1_000_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);
  await initGWKAccountIfNeeded(deployerAddress);

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `create2${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Create2`,
    () => {
      const implementationFactory = new ContractFactory(
        Create2.abi,
        Create2.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const create2Address = receipt.contractAddress;
  console.log(`    Create2 address:`, create2Address);

  const create2 = new Contract(
    create2Address,
    Create2.abi,
    deployer,
  ) as ICreate2;

  const salt = constants.HashZero;
  const initCodeHash = await create2.callStatic.INIT_CODE_HASH();

  console.log(
    "    create2 returns address:",
    await create2.callStatic.create(salt),
  );

  let offChainCreate2Address = utils.getCreate2Address(
    create2Address,
    salt,
    initCodeHash,
  );
  if (isGodwoken) {
    offChainCreate2Address = create2ContractAddressToGodwokenShortAddress(
      offChainCreate2Address,
    );
  }
  console.log("    Off-chain calculation:", offChainCreate2Address);

  let onChainCreate2Address = await create2.callStatic.getAddress(salt);
  if (isGodwoken) {
    onChainCreate2Address =
      await create2.callStatic.convertETHAddrToGodwokenAddr(
        onChainCreate2Address,
      );
  }
  console.log("    On-chain calculation:", onChainCreate2Address);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
