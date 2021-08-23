import {
  BigNumber,
  BigNumberish,
  CallOverrides,
  constants,
  Contract,
  ContractFactory,
  Overrides,
  providers,
} from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import {
  deployer,
  initGWKAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  rpc,
  unit,
  unitBNToLocaleString,
} from "../common";

import { TransactionSubmitter } from "../TransactionSubmitter";

import MintableToken from "../artifacts/contracts/MintableToken.sol/MintableToken.json";
import CurveToken from "../generated-artifacts/contracts/CurveTokenV3.json";
// import CurveToken from "../artifacts/contracts/CurveTokenV3.sol/CurveTokenV3.json";
import Faucet from "../artifacts/contracts/Faucet.sol/Faucet.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IMintableTokenStaticMethods extends TCallStatic {
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
}

interface IMintableToken extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
  setMinter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface ICurveTokenStaticMethods extends TCallStatic {
  totalSupply(overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
  minter(): Promise<string>;
}

interface ICurveToken extends Contract, ICurveTokenStaticMethods {
  callStatic: ICurveTokenStaticMethods;
  set_minter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  mint(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface IFaucet extends Contract {
  mint(
    tokens: string[],
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 1_000_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWKAccountIfNeeded(deployerAddress);

  let deployerRecipientAddress = deployerAddress;
  if (isGodwoken) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      await godwoker.getShortAddressByAllTypeEthAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerRecipientAddress);
  }

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `curve-token-and-faucet${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy MintableToken`,
    () => {
      const implementationFactory = new ContractFactory(
        MintableToken.abi,
        MintableToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        "MintableToken",
        "MT",
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );
  const mintableTokenAddress = receipt.contractAddress;
  console.log(`    MintableToken address:`, mintableTokenAddress);
  const mintableToken = new Contract(
    mintableTokenAddress,
    MintableToken.abi,
    deployer,
  ) as IMintableToken;

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy CurveToken`,
    () => {
      const implementationFactory = new ContractFactory(
        CurveToken.abi,
        CurveToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        "Curve Token",
        "CRV",
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const curveTokenAddress = receipt.contractAddress;
  console.log(`    CurveToken address:`, curveTokenAddress);
  const curveToken = new Contract(
    curveTokenAddress,
    CurveToken.abi,
    deployer,
  ) as ICurveToken;

  receipt = await transactionSubmitter.submitAndWait(`Deploy Faucet`, () => {
    const implementationFactory = new ContractFactory(
      Faucet.abi,
      Faucet.bytecode,
      deployer,
    );
    const tx = implementationFactory.getDeployTransaction();
    tx.gasPrice = txOverrides.gasPrice;
    tx.gasLimit = txOverrides.gasLimit;
    return deployer.sendTransaction(tx);
  });

  const faucetAddress = receipt.contractAddress;
  console.log(`    Faucet address:`, curveTokenAddress);
  const faucet = new Contract(faucetAddress, Faucet.abi, deployer) as IFaucet;

  await transactionSubmitter.submitAndWait(
    `Set Faucet as minter for MintableToken`,
    () => mintableToken.setMinter(faucetAddress, txOverrides),
  );

  console.log("    Minter:", await mintableToken.callStatic.minter());

  await transactionSubmitter.submitAndWait(
    `Set Faucet as minter for CurveToken`,
    () => curveToken.set_minter(faucetAddress, txOverrides),
  );

  console.log("    Minter:", await curveToken.callStatic.minter());

  await transactionSubmitter.submitAndWait("Mint 100,000 MT", () =>
    faucet.mint(
      [mintableTokenAddress, mintableTokenAddress],
      unit(50_000),
      txOverrides,
    ),
  );

  await transactionSubmitter.submitAndWait("Mint 100,000 CRV", () =>
    faucet.mint(
      [curveTokenAddress, curveTokenAddress],
      unit(50_000),
      txOverrides,
    ),
  );

  await transactionSubmitter.submitAndWait("Mint 100,000 CRV and MT", () =>
    faucet.mint(
      [curveTokenAddress, mintableTokenAddress],
      unit(100_000),
      txOverrides,
    ),
  );

  await transactionSubmitter.submitAndWait("Mint 100,000 MT and CRV", () =>
    faucet.mint(
      [mintableTokenAddress, curveTokenAddress],
      unit(100_000),
      txOverrides,
    ),
  );

  console.log(
    `Balances(MT, CRV):`,
    (
      await Promise.all(
        [mintableToken, curveToken].map((token) =>
          token.callStatic.balanceOf(deployerRecipientAddress),
        ),
      )
    )
      .map(unitBNToLocaleString)
      .join(", "),
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
