Deploy Ethereum contracts to [Godwoken](https://github.com/nervosnetwork/godwoken) and interact with them using Ethereum toolchain.

## Prerequisites

[`Node.js` v14+](https://nodejs.org) and [`Yarn`](https://yarnpkg.com/) are required.

Use [godwoken-kicker](https://github.com/RetricSu/godwoken-kicker) to start a quick devnet `godwoken-polyjuice` chain.

## Upgradeable Contracts

Contracts: [Box.sol](./contracts/Box.sol), [BoxV2.sol](./contracts/BoxV2.sol)

### Prerequisites

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```sh
yarn ts-node ./scripts/box-proxy.ts
```

## Multisignature Wallet

Contracts: [WalletSimple.sol](./contracts/WalletSimple.sol), [MintableToken.sol](./contracts/MintableToken.sol), [PolyjuiceAddress.sol](./contracts/PolyjuiceAddress.sol)

### Prerequisites

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```
yarn ts-node ./scripts/multi-sign-wallet.ts
```

### Incompatibility

- Because `ecrecover` returns **ETH Address** instead of **Polyjuice Address**, the `WalletSimple` contract cannot work as expected without modification.

  `WalletSimple` verifies two signers: one from `msg.sender` and the other from `ecrecover`, signer with address stored as **ETH Address** can only be used to sign transaction data, and signer with address stored as **Polyjuice Address** can only be used to execute transactions.

  Note that multisignature wallet implementation like [GnosisSafe](https://github.com/gnosis/safe-contracts/blob/main/contracts/GnosisSafe.sol) which verifies signers using only `ecrecover` should fully compatible with `godwoken-polyjuice`.
