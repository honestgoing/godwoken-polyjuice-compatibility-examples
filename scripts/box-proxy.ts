import { ContractFactory, Contract, BigNumberish, providers } from "ethers";

import {
  rpc,
  deployer,
  isGodwokenDevnet,
  initGWKAccountIfNeeded,
} from "../common";

import { deployProxy } from "../upgrades/deployProxy";
import { upgradeProxy } from "../upgrades/upgradeProxy";

import Box from "../artifacts/contracts/Box.sol/Box.json";
import BoxV2 from "../artifacts/contracts/BoxV2.sol/BoxV2.json";

type TCallStatic = Contract["callStatic"];

interface IBoxStaticMethods extends TCallStatic {
  value(): Promise<BigNumberish>;
}

interface IBox extends Contract, IBoxStaticMethods {
  callStatic: IBoxStaticMethods;
}

const deployerAddress = deployer.address;

async function main() {
  console.log("Deployer address:", deployerAddress);
  await initGWKAccountIfNeeded(deployerAddress);
  const { adminAddress, proxyAddress } = await deployProxy(
    {
      implementationName: "Box",
      proxyName: "Box",
      implementationFactory: new ContractFactory(
        Box.abi,
        Box.bytecode,
        deployer,
      ),
    },
    {
      initializer: "store",
      initializerArgs: [42],
      signer: deployer,
      gasPrice: isGodwokenDevnet ? 0 : undefined,
      gasLimit: isGodwokenDevnet ? 1_000_000 : undefined,
    },
  );

  const box = new Contract(proxyAddress, Box.abi, deployer) as IBox;
  console.log("Box value:", (await box.callStatic.value()).toString());

  await upgradeProxy(
    {
      adminAddress,
      proxyAddress,
      implementationName: "BoxV2",
      proxyName: "Box",
      implementationFactory: new ContractFactory(
        BoxV2.abi,
        BoxV2.bytecode,
        deployer,
      ),
    },
    {
      initializer: "increment",
      signer: deployer,
      gasPrice: isGodwokenDevnet ? 0 : undefined,
      gasLimit: isGodwokenDevnet ? 1_000_000 : undefined,
    },
  );

  const boxV2 = new Contract(proxyAddress, BoxV2.abi, deployer) as IBox;
  console.log(
    "Box value after upgrade:",
    (await boxV2.callStatic.value()).toString(),
  );

  try {
    const boxV2WithoutSigner = new Contract(
      proxyAddress,
      BoxV2.abi,
      rpc,
    ) as IBox;

    await boxV2WithoutSigner.callStatic.value();
  } catch (_) {
    console.log(
      "[Incompatibility] Failed to call static method without `from`",
    );
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
