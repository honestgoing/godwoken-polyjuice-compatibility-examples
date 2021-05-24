import { ContractFactory } from "ethers";

export function getInitializerData(
  ImplFactory: ContractFactory,
  initializer = "initialize",
  args?: unknown[],
): string {
  if (initializer === "") {
    return "0x";
  }

  const fragment = ImplFactory.interface.getFunction(initializer);
  return ImplFactory.interface.encodeFunctionData(fragment, args);
}
