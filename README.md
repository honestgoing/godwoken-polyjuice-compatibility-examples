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

Create such `.env` file, remember to replace with your godwoken-polyjuice devnet setting.

```sh
cat > .env <<EOF
DEPLOYER_PRIVATE_KEY=1473ec0e7c507de1d5c734a997848a78ee4d30846986d6b1d22002a57ece74ba
RPC_URL=http://localhost:8024
NETWORK_SUFFIX=gwk-devnet
SIGNER_PRIVATE_KEYS=bdb4474bdd46bf9897accc60c5eb945793e7a3d321bf3b70c30295ceb3433f28,f2d929da616e74fe61bbf5a87a910ac60cfd300d2011bd6212b84ddedddce8ea
GODWOKEN_API_URL=http://localhost:6101

ROLLUP_TYPE_HASH=< replace with your godwoken devnet rollup type hash >
ETH_ACCOUNT_LOCK_CODE_HASH=< replace with your godwoken devnet eth-account-lock code hash >
EOF

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

Create such `.env` file, remember to replace with your godwoken-polyjuice devnet setting.

```sh
cat > .env <<EOF
DEPLOYER_PRIVATE_KEY=1473ec0e7c507de1d5c734a997848a78ee4d30846986d6b1d22002a57ece74ba
RPC_URL=http://localhost:8024
NETWORK_SUFFIX=gwk-devnet
SIGNER_PRIVATE_KEYS=bdb4474bdd46bf9897accc60c5eb945793e7a3d321bf3b70c30295ceb3433f28,f2d929da616e74fe61bbf5a87a910ac60cfd300d2011bd6212b84ddedddce8ea
GODWOKEN_API_URL=http://localhost:6101

ROLLUP_TYPE_HASH=< replace with your godwoken devnet rollup type hash >
ETH_ACCOUNT_LOCK_CODE_HASH=< replace with your godwoken devnet eth-account-lock code hash >
EOF
```

### Run

```
yarn ts-node ./scripts/multi-sign-wallet.ts
```

### Incompatibility

- `WalletSimple` verifies two signers: one from `msg.sender` and the other from `ecrecover`. Because `msg.sender` is **Polyjuice Address** in `godwoken-polyjuice`, signer with address stored as **Ethereum Address** can only be used to sign transaction data, and signer with address stored as **Polyjuice Address** can only be used to execute transactions.

  Note that multisignature wallet implementation like [GnosisSafe](https://github.com/gnosis/safe-contracts/blob/main/contracts/GnosisSafe.sol) which verifies signers using only `ecrecover` should fully compatible with `godwoken-polyjuice`.
