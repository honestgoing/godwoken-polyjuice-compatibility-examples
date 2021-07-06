// SPDX-License-Identifier: MIT
pragma solidity >0.7.0 <0.8.0;
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";

/**
 *
 * WalletSimple
 * ============
 *
 * Basic multi-signer wallet designed for use in a co-signing environment where 2 signatures are required to move funds.
 * Typically used in a 2-of-3 signing configuration. Uses ecrecover to allow for 2 signatures in a single transaction.
 *
 * The first signature is created on the operation hash (see Data Formats) and passed to sendMultiSig/sendMultiSigToken
 * The signer is determined by verifyMultiSig().
 *
 * The second signature is created by the submitter of the transaction and determined by msg.signer.
 *
 * Data Formats
 * ============
 *
 * The signature is created with ethereumjs-util.ecsign(operationHash).
 * Like the eth_sign RPC call, it packs the values as a 65-byte array of [r, s, v].
 * Unlike eth_sign, the message is not prefixed.
 *
 * The operationHash the result of keccak256(prefix, toAddress, value, data, expireTime).
 * For ether transactions, `prefix` is "ETHER".
 * For token transaction, `prefix` is "ERC20" and `data` is the tokenContractAddress.
 *
 *
 */
contract WalletSimple {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    // Events
    event Deposited(address from, uint256 value, bytes data);
    event SafeModeActivated(address msgSender);
    event Transacted(
        address msgSender, // Address of the sender of the message initiating the transaction
        address otherSigner, // Address of the signer (second signature) used to initiate the transaction
        bytes32 operation, // Operation hash (see Data Formats)
        address toAddress, // The address the transaction was sent to
        uint256 value, // Amount of Wei sent to the address
        bytes data // Data sent when invoking the transaction
    );

    // Public fields
    mapping(address => bool) public signers; // The addresses that can co-sign transactions on the wallet
    address[] public signerAddressList;
    address public recentRecoverAddress;
    bytes32 public recentRecoverScriptHash;
    address public recentEcRecoverAddress;
    bool public safeMode = false; // When active, wallet may only send to signer addresses
    bool public initialized = false; // True if the contract has been initialized
    bytes32 public ethAccountLockCodeHash; 

    uint256 public count;

    // Internal fields
    uint256 private constant MAX_SEQUENCE_ID_INCREASE = 10000;
    uint256 constant SEQUENCE_ID_WINDOW_SIZE = 10;
    uint256[SEQUENCE_ID_WINDOW_SIZE] recentSequenceIds;

    /**
     * Set up a simple multi-sig wallet by specifying the signers allowed to be used on this wallet.
     * 2 signers will be required to send a transaction from this wallet.
     * Note: The sender is NOT automatically added to the list of signers.
     * Signers CANNOT be changed once they are set
     *
     * @param allowedSigners An array of signers on the wallet
     */
    function init(address[] calldata allowedSigners, bytes32 code_hash)
        external
        onlyUninitialized
    {
        require(allowedSigners.length == 3, "Invalid number of signers");

        for (uint8 i = 0; i < allowedSigners.length; i++) {
            require(allowedSigners[i] != address(0), "Invalid signer");
            signers[allowedSigners[i]] = true;
        }
        ethAccountLockCodeHash = code_hash;
        signerAddressList = allowedSigners; 
        initialized = true;
    }

    function init_code_hash(bytes32 eth_account_lock_code_hash) public {
        ethAccountLockCodeHash = eth_account_lock_code_hash;
    }

    /**
     * Get the network identifier that signers must sign over
     * This provides protection signatures being replayed on other chains
     * This must be a virtual function because chain-specific contracts will need
     *    to override with their own network ids. It also can't be a field
     *    to allow this contract to be used by proxy with delegatecall, which will
     *    not pick up on state variables
     */
    function getNetworkId() internal pure virtual returns (string memory) {
        return "ETHER";
    }

    /**
     * Get the network identifier that signers must sign over for token transfers
     * This provides protection signatures being replayed on other chains
     * This must be a virtual function because chain-specific contracts will need
     *    to override with their own network ids. It also can't be a field
     *    to allow this contract to be used by proxy with delegatecall, which will
     *    not pick up on state variables
     */
    function getTokenNetworkId() internal pure virtual returns (string memory) {
        return "ERC20";
    }

    /**
     * Get the network identifier that signers must sign over for batch transfers
     * This provides protection signatures being replayed on other chains
     * This must be a virtual function because chain-specific contracts will need
     *    to override with their own network ids. It also can't be a field
     *    to allow this contract to be used by proxy with delegatecall, which will
     *    not pick up on state variables
     */
    function getBatchNetworkId() internal pure virtual returns (string memory) {
        return "ETHER-Batch";
    }

    /**
     * Determine if an address is a signer on this wallet
     * @param signer address to check
     * returns boolean indicating whether address is signer or not
     */
    function isSigner(address signer) public view returns (bool) {
        return signers[signer];
    }

    function getSignerAddressList() public view returns (address[] memory) {
        return signerAddressList;
    }

    function getCodeHash() public view returns (bytes32) {
        return ethAccountLockCodeHash;
    }

    function getRecentRecoverScriptHash() public view returns (bytes32) {
        return recentRecoverScriptHash;
    }

    function getRecentRecoverAddress() public view returns (address) {
        return recentRecoverAddress;
    }

    /**
     * Modifier that will execute internal code block only if the sender is an authorized signer on this wallet
     */
    modifier onlySigner {
        require(isSigner(msg.sender), "Non-signer in onlySigner method");
        _;
    }

    /**
     * Modifier that will execute internal code block only if the contract has not been initialized yet
     */
    modifier onlyUninitialized {
        require(!initialized, "Contract already initialized");
        _;
    }

    /**
     * Verify that the sequence id has not been used before and inserts it. Throws if the sequence ID was not accepted.
     * We collect a window of up to 10 recent sequence ids, and allow any sequence id that is not in the window and
     * greater than the minimum element in the window.
     * @param sequenceId to insert into array of stored ids
     */
    function tryInsertSequenceId(uint256 sequenceId) public onlySigner {
        // Keep a pointer to the lowest value element in the window
        uint256 lowestValueIndex = 0;
        // fetch recentSequenceIds into memory for function context to avoid unnecessary sloads
        uint256[SEQUENCE_ID_WINDOW_SIZE] memory _recentSequenceIds =
            recentSequenceIds;
        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            require(
                _recentSequenceIds[i] != sequenceId,
                "Sequence ID already used"
            );

            if (_recentSequenceIds[i] < _recentSequenceIds[lowestValueIndex]) {
                lowestValueIndex = i;
            }
        }

        // The sequence ID being used is lower than the lowest value in the window
        // so we cannot accept it as it may have been used before
        require(
            sequenceId > _recentSequenceIds[lowestValueIndex],
            "Sequence ID below window"
        );

        // Block sequence IDs which are much higher than the lowest value
        // This prevents people blocking the contract by using very large sequence IDs quickly
        require(
            sequenceId <=
                (_recentSequenceIds[lowestValueIndex] +
                    MAX_SEQUENCE_ID_INCREASE),
            "Sequence ID above maximum"
        );

        recentSequenceIds[lowestValueIndex] = sequenceId;
    }

    /**
     * Gets the next available sequence ID for signing when using executeAndConfirm
     * returns the sequenceId one higher than the highest currently stored
     */
    function getNextSequenceId() public view returns (uint256) {
        uint256 highestSequenceId = 0;
        for (uint256 i = 0; i < SEQUENCE_ID_WINDOW_SIZE; i++) {
            if (recentSequenceIds[i] > highestSequenceId) {
                highestSequenceId = recentSequenceIds[i];
            }
        }
        return highestSequenceId + 1;
    }

    /**
     * Do common multisig verification for both eth sends and erc20token transfers
     *
     * @param toAddress the destination address to send an outgoing transaction
     * @param operationHash see Data Formats
     * @param signature see Data Formats
     * @param expireTime the number of seconds since 1970 for which this transaction is valid
     * @param sequenceId the unique sequence id obtainable from getNextSequenceId
     * returns address that has created the signature
     */
    function verifyMultiSig(
        address toAddress,
        bytes32 operationHash,
        bytes calldata signature,
        uint256 expireTime,
        uint256 sequenceId
    ) public returns (address) {
        // Verify if we are in safe mode. In safe mode, the wallet can only send to signers
        require(
            !safeMode || isSigner(toAddress),
            "External transfer in safe mode"
        );

        // Verify that the transaction has not expired
        require(expireTime >= block.timestamp, "Transaction expired");

        address otherSigner =
            recoverAddressFromSignature(operationHash, signature);

        // Try to insert the sequence ID. Will revert if the sequence id was invalid
        tryInsertSequenceId(sequenceId);

        require(isSigner(otherSigner), "Invalid signer");
// 
        // require(otherSigner != msg.sender, "Signers cannot be equal");

        return otherSigner;
    }

    /**
     * Execute a multi-signature transaction from this wallet using 2 signers: one from msg.sender and the other from ecrecover.
     * Sequence IDs are numbers starting from 1. They are used to prevent replay attacks and may not be repeated.
     *
     * @param toAddress the destination address to send an outgoing transaction
     * @param value the amount in Wei to be sent
     * @param data the data to send to the toAddress when invoking the transaction
     * @param expireTime the number of seconds since 1970 for which this transaction is valid
     * @param sequenceId the unique sequence id obtainable from getNextSequenceId
     * @param signature see Data Formats
     */
    function sendMultiSig(
        address toAddress,
        uint256 value,
        bytes calldata data,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) public onlySigner {
        // Verify the other signer
        bytes32 operationHash =
            keccak256(
                abi.encodePacked(
                    getNetworkId(),
                    toAddress,
                    value,
                    data,
                    expireTime,
                    sequenceId
                )
            );

        address otherSigner =
            verifyMultiSig(
                toAddress,
                operationHash,
                signature,
                expireTime,
                sequenceId
            );

        emit Transacted(
            msg.sender,
            otherSigner,
            operationHash,
            toAddress,
            value,
            data
        );

        // Success, send the transaction
        (bool success, ) = toAddress.call{value: value}(data);
        require(success, "Call execution failed");

        emit Transacted(
            msg.sender,
            otherSigner,
            operationHash,
            toAddress,
            value,
            data
        );
    }

    /**
     * Execute a multi-signature token transfer from this wallet using 2 signers: one from msg.sender and the other from ecrecover.
     * Sequence IDs are numbers starting from 1. They are used to prevent replay attacks and may not be repeated.
     *
     * @param toAddress the destination address to send an outgoing transaction
     * @param value the amount in tokens to be sent
     * @param tokenContractAddress the address of the erc20 token contract
     * @param expireTime the number of seconds since 1970 for which this transaction is valid
     * @param sequenceId the unique sequence id obtainable from getNextSequenceId
     * @param signature see Data Formats
     */
    function sendMultiSigToken(
        address toAddress,
        uint256 value,
        address tokenContractAddress,
        uint256 expireTime,
        uint256 sequenceId,
        bytes calldata signature
    ) external onlySigner {
        // Verify the other signer
        bytes32 operationHash =
            keccak256(
                abi.encodePacked(
                    getTokenNetworkId(),
                    toAddress,
                    value,
                    tokenContractAddress,
                    expireTime,
                    sequenceId
                )
            );

        verifyMultiSig(
            toAddress,
            operationHash,
            signature,
            expireTime,
            sequenceId
        );

        IERC20Upgradeable(tokenContractAddress).safeTransfer(toAddress, value);
    }

    /**
     * Irrevocably puts contract into safe mode. When in this mode, transactions may only be sent to signing addresses.
     */
    function activateSafeMode() external onlySigner {
        safeMode = true;
        emit SafeModeActivated(msg.sender);
    }

    function getMessageHash(
        string memory prefix,
        address toAddress,
        uint256 value,
        bytes calldata data,
        uint256 expireTime,
        uint256 sequenceId
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    prefix,
                    toAddress,
                    value,
                    data,
                    expireTime,
                    sequenceId
                )
            );
    }

    /**
     * Gets signer's address using ecrecover
     * @param operationHash see Data Formats
     * @param signature see Data Formats
     * returns address recovered from the signature
     */
    function recoverAddressFromSignature(
        bytes32 operationHash,
        bytes memory signature
    ) public returns (address) {
        // splitSignature
        require(signature.length == 65, "Invalid signature - wrong length");

        bytes32 check =
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    operationHash
                )
            );

        // note use polyRecover instead of ecrecover
        
        return polyRecover(check, signature, ethAccountLockCodeHash);
    }

    function getPersonalMessage(bytes32 unprefix_msg) public view returns (bytes32) {
        bytes32 check =
            keccak256(
                abi.encodePacked(
                    "\x19Ethereum Signed Message:\n32",
                    unprefix_msg
                )
            );
        return check;
    }

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

        recentRecoverScriptHash = script_hash; 
        recentRecoverAddress = address(uint160(uint256(recentRecoverScriptHash) >> 96));

        return recentRecoverAddress;
    }

    function ecRecover(bytes32 message, bytes memory signature) public returns (address addr) {
        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        recentEcRecoverAddress = ecrecover(message, v, r, s); 
        return recentEcRecoverAddress; 
    }
}
