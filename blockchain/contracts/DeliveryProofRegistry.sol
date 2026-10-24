// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DeliveryProofRegistry
 * @author ProofChain
 * @notice Permissioned registry for storing and verifying delivery proof hashes.
 *         Only the proof hash and minimal metadata are stored on-chain.
 *         Sensitive business data remains off-chain in the private MySQL database.
 *
 * @dev Designed for deployment on a Hyperledger Besu permissioned network.
 *      The contract stores a SHA-256 proof hash (as bytes32) per delivery ID.
 *      Authorized callers are managed by the contract owner.
 */
contract DeliveryProofRegistry {
    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;

    struct ProofEntry {
        bytes32 proofHash;      // SHA-256 hash of the canonicalized delivery payload
        address submittedBy;    // address of the backend signer that submitted the proof
        uint256 timestamp;      // block timestamp at registration
        bool exists;            // sentinel to distinguish zero-hash from missing entry
        ProofStatus status;     // workflow status
    }

    enum ProofStatus {
        Pending,    // 0 – registered but not yet reviewed
        Approved,   // 1 – receiver accepted the delivery
        Rejected,   // 2 – receiver rejected the delivery
        Disputed    // 3 – under audit review
    }

    /// @dev deliveryId (UUID string, UTF-8) → ProofEntry
    mapping(string => ProofEntry) private _proofs;

    /// @dev Addresses authorized to register / update proofs
    mapping(address => bool) public authorized;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProofRegistered(
        string indexed deliveryId,
        bytes32 proofHash,
        address indexed submittedBy,
        uint256 timestamp
    );

    event ProofStatusUpdated(
        string indexed deliveryId,
        ProofStatus previousStatus,
        ProofStatus newStatus,
        address indexed updatedBy,
        uint256 timestamp
    );

    event AuthorizationGranted(address indexed account, address indexed grantedBy);
    event AuthorizationRevoked(address indexed account, address indexed revokedBy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Custom Errors ────────────────────────────────────────────────────────

    error Unauthorized();
    error AlreadyRegistered(string deliveryId);
    error ProofNotFound(string deliveryId);
    error InvalidHash();
    error InvalidDeliveryId();
    error ZeroAddressNotAllowed();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorized[msg.sender] && msg.sender != owner) revert Unauthorized();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address[] memory initialAuthorized) {
        owner = msg.sender;
        authorized[msg.sender] = true;
        for (uint256 i = 0; i < initialAuthorized.length; i++) {
            if (initialAuthorized[i] != address(0)) {
                authorized[initialAuthorized[i]] = true;
                emit AuthorizationGranted(initialAuthorized[i], msg.sender);
            }
        }
    }

    // ─── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Register a proof hash for a delivery.
     * @param deliveryId  Unique delivery identifier (UUID string from off-chain DB).
     * @param proofHash   SHA-256 hash of the canonicalized delivery payload as bytes32.
     */
    function registerProof(
        string calldata deliveryId,
        bytes32 proofHash
    ) external onlyAuthorized {
        if (bytes(deliveryId).length == 0) revert InvalidDeliveryId();
        if (proofHash == bytes32(0)) revert InvalidHash();
        if (_proofs[deliveryId].exists) revert AlreadyRegistered(deliveryId);

        _proofs[deliveryId] = ProofEntry({
            proofHash: proofHash,
            submittedBy: msg.sender,
            timestamp: block.timestamp,
            exists: true,
            status: ProofStatus.Pending
        });

        emit ProofRegistered(deliveryId, proofHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Verify whether a submitted hash matches the registered proof.
     * @param deliveryId     The delivery identifier.
     * @param candidateHash  The hash to compare against the registered proof.
     * @return matches       True if the candidate matches the stored proof.
     * @return entry         The full ProofEntry for inspection.
     */
    function verifyProof(
        string calldata deliveryId,
        bytes32 candidateHash
    ) external view returns (bool matches, ProofEntry memory entry) {
        ProofEntry memory e = _proofs[deliveryId];
        if (!e.exists) revert ProofNotFound(deliveryId);
        return (e.proofHash == candidateHash, e);
    }

    /**
     * @notice Retrieve the stored proof entry for a delivery.
     * @param deliveryId  The delivery identifier.
     * @return entry      The full ProofEntry.
     */
    function getProof(
        string calldata deliveryId
    ) external view returns (ProofEntry memory entry) {
        ProofEntry memory e = _proofs[deliveryId];
        if (!e.exists) revert ProofNotFound(deliveryId);
        return e;
    }

    /**
     * @notice Check whether a proof has been registered for a delivery.
     * @param deliveryId  The delivery identifier.
     * @return            True if a proof record exists.
     */
    function proofExists(string calldata deliveryId) external view returns (bool) {
        return _proofs[deliveryId].exists;
    }

    /**
     * @notice Update the workflow status of a registered proof.
     * @param deliveryId  The delivery identifier.
     * @param newStatus   The new ProofStatus value.
     */
    function updateProofStatus(
        string calldata deliveryId,
        ProofStatus newStatus
    ) external onlyAuthorized {
        ProofEntry storage entry = _proofs[deliveryId];
        if (!entry.exists) revert ProofNotFound(deliveryId);

        ProofStatus previous = entry.status;
        entry.status = newStatus;

        emit ProofStatusUpdated(deliveryId, previous, newStatus, msg.sender, block.timestamp);
    }

    // ─── Authorization Management ─────────────────────────────────────────────

    /**
     * @notice Grant authorization to an address to register and update proofs.
     * @param account  The address to authorize.
     */
    function grantAuthorization(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddressNotAllowed();
        authorized[account] = true;
        emit AuthorizationGranted(account, msg.sender);
    }

    /**
     * @notice Revoke authorization from an address.
     * @param account  The address to deauthorize.
     */
    function revokeAuthorization(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddressNotAllowed();
        authorized[account] = false;
        emit AuthorizationRevoked(account, msg.sender);
    }

    /**
     * @notice Transfer contract ownership.
     * @param newOwner  The new owner address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddressNotAllowed();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
