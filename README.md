Deploy Ethereum contracts to [Godwoken](https://github.com/nervosnetwork/godwoken) and interact with them using Ethereum toolchain.

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

## Multisignature Wallet

Contracts: [WalletSimple.sol](./contracts/WalletSimple.sol), [MintableToken.sol](./contracts/MintableToken.sol), [PolyjuiceAddress.sol](./contracts/PolyjuiceAddress.sol)

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

### compatibility

- by using `polyRecover`(a special version of `ecrecover` in polyjuice) with providers, you can now recover eth address from signature. there exist no incompatibility now.

how to use polyRecover like ecrecover:

```sol
    function polyRecover(bytes32 message, bytes memory signature, bytes32 eth_account_lock_code_hash) public returns (address addr) {

        if (int8(signature[64]) >= 27){
            signature[64] = byte(int8(signature[64]) - 27);
        }

        bytes memory input = abi.encode(message, signature, eth_account_lock_code_hash);
        bytes32[1] memory output;
        assembly {
            let len := mload(input)
            if iszero(call(not(0), 0xf2, 0x0, add(input, 0x20), len, output, 288)) {
                revert(0x0, 0x0)
            }
        }
        bytes32 script_hash = output[0];
        require(script_hash.length == 32, "invalid recovered script hash length");

        recover_address = address(uint160(uint256(recentRecoverScriptHash) >> 96));

        return recover_address;
    }
```

## Multicall

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
