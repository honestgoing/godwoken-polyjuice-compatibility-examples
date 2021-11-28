import {
  ContractFactory,
  Contract,
  BigNumberish,
  providers,
  Overrides,
  CallOverrides,
  BigNumber,
  utils as ethersUtils,
  Signer,
  PopulatedTransaction,
  Wallet as EthersWallet,
} from "ethers";
import { AbiItems, ShortAddress } from "@polyjuice-provider/base";
import {
  PolyjuiceJsonRpcProvider,
  PolyjuiceWallet,
} from "@polyjuice-provider/ethers";

import { TransactionSubmitter } from "../TransactionSubmitter";
import {
  rpc,
  deployer,
  networkSuffix,
  initGWKAccountIfNeeded,
  isGodwoken,
  polyjuiceConfig,
} from "../common";

import WalletSimple from "../artifacts/contracts/WalletSimple.sol/WalletSimple.json";
import MintableToken from "../artifacts/contracts/MintableTokenFixedParams.sol/MintableTokenFixedParams.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IWalletSimpleStaticMethods extends TCallStatic {
  getNextSequenceId(overrides?: CallOverrides): Promise<BigNumber>;
  EMPTY_LOCK_HASH(): Promise<string>;
}

interface IWalletSimple extends Contract, IWalletSimpleStaticMethods {
  callStatic: IWalletSimpleStaticMethods;
  init(
    signers: [string, string, string],
    code_hash: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  sendMultiSig(
    toAddress: string,
    value: BigNumberish,
    data: string,
    expireTime: number,
    sequenceId: string,
    signature: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface IMintableTokenStaticMethods extends TCallStatic {
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
}

interface IMintableToken extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
  setMinter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  mint(
    account: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  populateTransaction: {
    mint(account: string, amount: BigNumberish): Promise<PopulatedTransaction>;
  };
}

const deployerAddress = deployer.address;

const { SIGNER_PRIVATE_KEYS } = process.env;
if (SIGNER_PRIVATE_KEYS == null) {
  console.log("process.env.SIGNER_PRIVATE_KEYS is required");
  process.exit(1);
}
const signerPrivateKeys = SIGNER_PRIVATE_KEYS.split(",") as [string, string];
if (signerPrivateKeys.length !== 2) {
  console.log(
    "Invalid number of signers, required: 2, got:",
    signerPrivateKeys.length,
  );
  process.exit(1);
}

const [signerOne, signerTwo] = signerPrivateKeys.map((signerPrivateKey) =>
  isGodwoken
    ? new PolyjuiceWallet(signerPrivateKey, polyjuiceConfig, rpc)
    : new EthersWallet(signerPrivateKey, rpc),
);

const [signerOneAddress, signerTwoAddress] = [signerOne, signerTwo].map(
  (wallet) => wallet.address,
);

const txOverride = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 1_000_000 : undefined,
};

async function main() {
  // init godwoken accounts of signers first
  await initGWKAccountIfNeeded(signerTwoAddress);
  await initGWKAccountIfNeeded(signerOneAddress);
  await initGWKAccountIfNeeded(deployerAddress);

  console.log("Deployer address:", deployerAddress);

  // explicitly get godwoken address for `populateTransaction` encoding
  let deployerRecipientAddress = deployerAddress;
  if (isGodwoken) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      godwoker.computeShortAddressByEoaEthAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerRecipientAddress);
  }

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `multi-sign-wallet${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy WalletSimple`,
    () => {
      const implementationFactory = new ContractFactory(
        WalletSimple.abi,
        WalletSimple.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverride.gasPrice;
      tx.gasLimit = txOverride.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );
  const walletSimpleAddress = receipt.contractAddress;
  console.log(`    WalletSimple address:`, walletSimpleAddress);

  const walletSimple = new Contract(
    walletSimpleAddress,
    WalletSimple.abi,
    deployer,
  ) as IWalletSimple;

  if (isGodwoken) {
    // for address auto conversion (Ethereum -> Godwoken)
    (deployer as PolyjuiceWallet).setAbi(WalletSimple.abi as AbiItems);
    (signerOne as PolyjuiceWallet).setAbi(WalletSimple.abi as AbiItems);
    (signerTwo as PolyjuiceWallet).setAbi(WalletSimple.abi as AbiItems);
  }

  const signerAddresses: [string, string, string] = [
    signerOneAddress,
    signerTwoAddress,
    deployerAddress,
  ];
  console.log("Signer addresses:", signerAddresses.join(", "));

  await transactionSubmitter.submitAndWait(`Init WalletSimple`, async () => {
    return walletSimple.init(
      signerAddresses,
      isGodwoken
        ? process.env.ETH_ACCOUNT_LOCK_CODE_HASH!
        : await walletSimple.callStatic.EMPTY_LOCK_HASH(),
      txOverride,
    );
  });

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy MintableToken`,
    () => {
      const implementationFactory = new ContractFactory(
        MintableToken.abi,
        MintableToken.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction();
      tx.gasPrice = txOverride.gasPrice;
      tx.gasLimit = txOverride.gasLimit;
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

  await transactionSubmitter.submitAndWait(`Set WalletSimple as minter`, () => {
    return mintableToken.setMinter(walletSimpleAddress, txOverride);
  });

  console.log(
    "User balance before mint:",
    (await mintableToken.balanceOf(deployerRecipientAddress)).toString(),
  );

  await transactionSubmitter.submitAndWait(
    `Mint 100 token using WalletSimple`,
    async () => {
      const walletSimpleForSignerTwo = new Contract(
        walletSimpleAddress,
        WalletSimple.abi,
        signerTwo,
      ) as IWalletSimple;

      const baseTx = await mintableToken.populateTransaction.mint(
        deployerRecipientAddress,
        "100",
      );

      const sequenceId = await walletSimple.getNextSequenceId();

      console.log(`    Signing tx using signer one(${signerOneAddress})`);
      const signedTx = await generateSignedTx(
        sequenceId,
        baseTx,
        60,
        signerOne,
      );

      console.log(`    Executing tx using signer two(${signerTwoAddress})`);
      return walletSimpleForSignerTwo.sendMultiSig(
        signedTx.toAddress,
        signedTx.value.toString(),
        signedTx.data,
        signedTx.expireTime,
        signedTx.sequenceId,
        signedTx.signature,
        txOverride,
      );
    },
  );

  console.log(
    "    User balance after mint:",
    (await mintableToken.balanceOf(deployerRecipientAddress)).toString(),
  );
}

async function getSignature(
  signer: Signer,
  prefix: string,
  toAddress: string,
  value: string,
  data: string,
  expireTime: number,
  sequenceId: BigNumber,
): Promise<string> {
  // console.log([prefix, toAddress, value, data, expireTime, sequenceId]);
  const operationHash = ethersUtils.solidityKeccak256(
    ["string", "address", "uint256", "bytes", "uint256", "uint256"],
    [prefix, toAddress, value, data, expireTime, sequenceId],
  );

  const signature = await signer.signMessage(
    ethersUtils.arrayify(operationHash),
  );

  // const packed_signature = deployer.godwoker.packSignature(origin_signature);

  // console.log(`origin_signature: ${origin_signature}, packed_signature: ${packed_signature}`);

  return signature;
}

interface ISignedContractInteractionTx {
  toAddress: string;
  value: string;
  data: string;
  expireTime: number;
  sequenceId: string;
  signature: string;
}

export async function generateSignedTx(
  sequenceId: BigNumber,
  baseTx: PopulatedTransaction,
  expireIn: number,
  signer: Signer,
): Promise<ISignedContractInteractionTx> {
  const expireTime = Date.now() + expireIn * 1000;

  const unsignedTx = {
    toAddress: baseTx.to!,
    value: baseTx.value || "0",
    data: baseTx.data!,
    expireTime,
    sequenceId,
  };

  const signature = await getSignature(
    signer,
    "ETHER",
    unsignedTx.toAddress,
    unsignedTx.value.toString(),
    unsignedTx.data,
    unsignedTx.expireTime,
    unsignedTx.sequenceId,
  );

  // console.log(`signature: ${signature}`);
  // console.log(`unsignedTx.data: ${unsignedTx.data}`);

  return {
    toAddress: unsignedTx.toAddress.toLowerCase(),
    value: unsignedTx.value.toString(),
    data: unsignedTx.data,
    expireTime,
    sequenceId: sequenceId.toString(),
    signature,
  };
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
