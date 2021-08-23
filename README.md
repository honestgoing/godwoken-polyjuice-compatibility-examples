Deploy Ethereum contracts (with compatibility modifications) to Nervos's [Godwoken](https://github.com/nervosnetwork/godwoken) [Polyjuice](https://github.com/nervosnetwork/godwoken-polyjuice) and interact with them using Ethereum toolchain.

## Prerequisites

[`Node.js` v14+](https://nodejs.org) and [`Yarn`](https://yarnpkg.com/) are required.

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
# testnet
yarn ts-node ./scripts/box-proxy.ts

# devnet
ENV_PATH=./.env.dev yarn ts-node ./scripts/box-proxy.ts
```

### Compatibility Modification Note

Fully compatible without modification.

## Multisignature Wallet

This example implement a simple multisig-wallet. For more details, see [WalletSimple](./contracts/WalletSimple.sol) contract code.

Contracts: [WalletSimple.sol](./contracts/WalletSimple.sol), [MintableTokenFixedParams.sol](./contracts/MintableTokenFixedParams.sol)

### Prerequisites

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```sh
# testnet
yarn ts-node ./scripts/multi-sign-wallet.ts

# devnet
ENV_PATH=./.env.dev yarn ts-node ./scripts/multi-sign-wallet.ts
```

### Compatibility Modification Note

See [WalletSimple.diff](./contracts/WalletSimple.diff) for Polyjuice compatibility modification.

Since `ecrecover` will return Ethereum address instead of Godwoken address, it's hardly useful on polyjuice. If your contract need to recover Godwoken address, use `polyRecover`(a special version of `ecrecover` in polyjuice). More details on [Godwoken Address vs Ethereum Address](https://github.com/nervosnetwork/godwoken/blob/master/docs/known_caveats_of_polyjuice.md#godwoken-address-vs-ethereum-address).

## Multicall

This example demonstrate how to call one or more contract methods dynamically in a contract.

Contracts: [Multicall.sol](./contracts/Multicall.sol)

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```sh
# testnet
yarn ts-node ./scripts/multicall.ts

# devnet
ENV_PATH=./.env.dev yarn ts-node ./scripts/multicall.ts
```

### Compatibility Modification Note

Fully compatible without modification.

## Create2

This example demonstrate the calculation (both on-chain and off-chain) of [`create2`](https://eips.ethereum.org/EIPS/eip-1014) generated contract address.

Contracts: [Create2.sol](./contracts/Create2.sol)

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```sh
# testnet
yarn ts-node ./scripts/create2.ts

# devnet
ENV_PATH=./.env.dev yarn ts-node ./scripts/create2.ts
```

### Compatibility Modification Note

Need extra method (`convertETHAddrToGodwokenAddr` in [Create2.sol](./contracts/Create2.sol)) to convert contract address for on-chain calculation.

## Curve StableSwap

**NOTE: Not working for testnet now (2021-08-23), needs a fix.**

This example includes a Curve stable swap 3pool implementation.

Contracts: [StableSwap3Pool.vy](./contracts/StableSwap3Pool.vy), [CurveTokenV3.vy](./contracts/CurveTokenV3.vy), [MintableToken.sol](./contracts/MintableToken.sol), [Faucet.sol](./contracts/Faucet.sol)

Install dependencies and compile contracts if not already.

```sh
yarn install
yarn compile
```

### Run

```sh
# testnet
yarn ts-node ./scripts/stable-swap-3-pool.ts

# devnet
ENV_PATH=./.env.dev yarn ts-node ./scripts/stable-swap-3-pool.ts
```

### Compatibility Modification Note

Fully compatible without modification.

## Devnet Debugging

Use [godwoken-kicker](https://github.com/RetricSu/godwoken-kicker) to start a quick devnet `godwoken-polyjuice` chain.

Create such `.env.dev` file, remember to replace with your godwoken-polyjuice devnet setting.

```sh
cat > .env.dev <<EOF
DEPLOYER_PRIVATE_KEY=1473ec0e7c507de1d5c734a997848a78ee4d30846986d6b1d22002a57ece74ba
RPC_URL=http://localhost:8024
NETWORK_SUFFIX=gwk-devnet
SIGNER_PRIVATE_KEYS=bdb4474bdd46bf9897accc60c5eb945793e7a3d321bf3b70c30295ceb3433f28,f2d929da616e74fe61bbf5a87a910ac60cfd300d2011bd6212b84ddedddce8ea

ROLLUP_TYPE_HASH=< replace with your godwoken devnet rollup type hash >
ETH_ACCOUNT_LOCK_CODE_HASH=< replace with your godwoken devnet eth-account-lock code hash >

GODWOKEN_API_URL=http://localhost:6101
EOF
```

Tip: You can use environment variable IGNORE_HISTORY to force re-run a script

```sh
IGNORE_HISTORY=true ENV_PATH=./.env.dev yarn ts-node ./scripts/box-proxy.ts
```
