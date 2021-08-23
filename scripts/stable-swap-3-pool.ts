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
import Faucet from "../artifacts/contracts/Faucet.sol/Faucet.json";
import CurveTokenV3 from "../generated-artifacts/contracts/CurveTokenV3.json";
import StableSwap3Pool from "../generated-artifacts/contracts/StableSwap3Pool.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IMintableTokenStaticMethods extends TCallStatic {
  totalSupply(overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
  minter(): Promise<string>;
}

interface IMintableToken extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
  setMinter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  mint(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  approve(
    spender: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface ICurveTokenV3 extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
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

interface ISwapStaticMethods extends TCallStatic {
  coins(index: number, overrides?: CallOverrides): Promise<string>;
  balances(index: number, overrides?: CallOverrides): Promise<BigNumber>;
  calc_token_amount(
    amounts: BigNumberish[],
    deposit: boolean,
    overrides?: CallOverrides,
  ): Promise<BigNumber>;
}

interface ISwap extends Contract, ISwapStaticMethods {
  callStatic: ISwapStaticMethods;
  add_liquidity(
    amounts: BigNumberish[],
    min_mint_amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  exchange(
    input_token_index: number,
    output_token_index: number,
    input_amount: BigNumberish,
    min_output_amount: BigNumberish,
  ): Promise<TransactionResponse>;
}

interface IFaucet extends Contract {
  mint(
    tokens: string[],
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const { MaxUint256 } = constants;

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 1_000_000 : undefined,
};

const tokens = {
  DAI: "Dai Stablecoin",
  USDC: "USD Coin",
  USDT: "Tether",
};

async function main() {
  console.log("Deployer address:", deployerAddress);

  await initGWKAccountIfNeeded(deployerAddress);

  let deployerRecipientAddress = deployerAddress;
  if (isGodwoken) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      await godwoker.getShortAddressByAllTypeEthAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerRecipientAddress);
  }

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `stable-swap-3-pool${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  const tokenAddresses: { [symbol: string]: string } = {};
  const tokenContracts: { [symbol: string]: IMintableToken } = {};
  for (const [symbol, name] of Object.entries(tokens)) {
    const tokenAddress = await deployToken(name, symbol);
    tokenAddresses[symbol] = tokenAddress;
    tokenContracts[symbol] = new Contract(
      tokenAddress,
      MintableToken.abi,
      deployer,
    ) as IMintableToken;
  }

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Faucet`,
    () => {
      const implementationFactory = new ContractFactory(
        Faucet.abi,
        Faucet.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const faucetAddress = receipt.contractAddress;
  console.log(`    Faucet address:`, faucetAddress);
  const faucet = new Contract(faucetAddress, Faucet.abi, deployer) as IFaucet;

  for (const [symbol, tokenContract] of Object.entries(tokenContracts)) {
    await transactionSubmitter.submitAndWait(
      `Set faucet as minter for ${symbol}`,
      () => tokenContract.setMinter(faucetAddress, txOverrides),
    );
    console.log(
      `    ${symbol} minter:`,
      await tokenContract.callStatic.minter(),
    );
  }

  await transactionSubmitter.submitAndWait(
    `Mint 100,000 ${Object.keys(tokens).join(", ")}`,
    () =>
      faucet.mint(Object.values(tokenAddresses), unit(100_000), txOverrides),
  );

  console.log(
    `    User balances (${Object.keys(tokens).join(", ")}):`,
    (
      await Promise.all(
        Object.values(tokenContracts).map((tokenContract) =>
          tokenContract.callStatic.balanceOf(deployerRecipientAddress),
        ),
      )
    )
      .map(unitBNToLocaleString)
      .join(", "),
  );

  receipt = await transactionSubmitter.submitAndWait(`Deploy crv3POOL`, () => {
    const implementationFactory = new ContractFactory(
      CurveTokenV3.abi,
      CurveTokenV3.bytecode,
      deployer,
    );
    const tx = implementationFactory.getDeployTransaction(
      "Curve 3Pool",
      "crv3POOL",
    );
    tx.gasPrice = txOverrides.gasPrice;
    tx.gasLimit = txOverrides.gasLimit;
    return deployer.sendTransaction(tx);
  });

  const crv3POOLAddress = receipt.contractAddress;
  console.log(`    crv3POOL address:`, crv3POOLAddress);
  const crv3POOL = new Contract(
    crv3POOLAddress,
    CurveTokenV3.abi,
    deployer,
  ) as ICurveTokenV3;

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy StableSwap3Pool`,
    () => {
      const implementationFactory = new ContractFactory(
        StableSwap3Pool.abi,
        StableSwap3Pool.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        deployerRecipientAddress,
        Object.values(tokenAddresses),
        crv3POOLAddress,
        200,
        4000000,
        0,
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const swapAddress = receipt.contractAddress;
  console.log(`    StableSwap3Pool address:`, swapAddress);
  const swap = new Contract(
    swapAddress,
    StableSwap3Pool.abi,
    deployer,
  ) as ISwap;

  console.log(
    `    StableSwap3Pool.coins (${Object.keys(tokens).join(", ")}):`,
    (
      await Promise.all([
        swap.callStatic.coins(0),
        swap.callStatic.coins(1),
        swap.callStatic.coins(2),
      ])
    ).join(", "),
  );

  console.log(
    `    StableSwap3Pool.balances (${Object.keys(tokens).join(", ")}):`,
    (
      await Promise.all([
        swap.callStatic.balances(0),
        swap.callStatic.balances(1),
        swap.callStatic.balances(2),
      ])
    )
      .map(unitBNToLocaleString)
      .join(", "),
  );

  await transactionSubmitter.submitAndWait(
    `Set StableSwap3Pool as minter for crv3POOL`,
    () => crv3POOL.set_minter(swapAddress, txOverrides),
  );

  console.log("    crv3POOL minter:", await crv3POOL.callStatic.minter());

  for (const [symbol, tokenContract] of Object.entries(tokenContracts)) {
    await transactionSubmitter.submitAndWait(
      `Approve ${symbol} to StableSwap3Pool`,
      () => tokenContract.approve(swapAddress, MaxUint256, txOverrides),
    );
  }

  await transactionSubmitter.submitAndWait("Add 50,000 liquidity", () =>
    swap.add_liquidity(
      [unit(50_000), unit(50_000), unit(50_000)],
      0,
      txOverrides,
    ),
  );

  console.log(
    "    StableSwap3Pool.balances:",
    (
      await Promise.all([
        swap.callStatic.balances(0),
        swap.callStatic.balances(1),
        swap.callStatic.balances(2),
      ])
    )
      .map(unitBNToLocaleString)
      .join(", "),
  );

  console.log(
    `    User balances (${Object.keys(tokens).join(", ")}, and crv3POOL):`,
    (
      await Promise.all(
        Object.values(tokenContracts)
          .map((tokenContract) =>
            tokenContract.callStatic.balanceOf(deployerRecipientAddress),
          )
          .concat(crv3POOL.callStatic.balanceOf(deployerRecipientAddress)),
      )
    )
      .map(unitBNToLocaleString)
      .join(", "),
  );

  async function deployToken(name: string, symbol: string) {
    const receipt = await transactionSubmitter.submitAndWait(
      `Deploy ${symbol}`,
      () => {
        const implementationFactory = new ContractFactory(
          MintableToken.abi,
          MintableToken.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction(name, symbol);
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );

    const address = receipt.contractAddress;
    console.log(`    ${symbol} address:`, address);

    return address;
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
