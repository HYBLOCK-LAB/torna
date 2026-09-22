// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

enum PositionState {
    Registered,
    Advanced,
    Repaid,
    Overdue,
    Review,
    CoveredLoss,
    CapHeld,
    RecoveryRecorded
}

enum IssuerState {
    Active,
    MarginCall,
    Suspended,
    Deregistered
}

enum AdvanceRejection {
    None,
    DuplicateRefundKey,
    UnregisteredIssuer,
    InvalidSignature,
    ChainMismatch,
    DeadlineExpired,
    IssuerLimitExceeded,
    AcquirerExposureExceeded,
    IssuerSuspended
}

enum DepositRejection {
    None,
    DepositCapExceeded,
    ConcentrationExceeded
}

/// @notice 6-decimal base units for amount; Unix seconds for timestamps.
struct AdvanceRequest {
    bytes32 refundKey;
    address issuer;
    bytes32 acquirerHash;
    uint256 amount;
    uint64 maturity;
    uint256 nonce;
    uint256 deadline;
}

/// @notice One successfully funded refund. Amounts are six-decimal token units.
/// @dev Margin/coverage are loss terms, NOT collateral locked per position.
struct Position {
    bool exists;
    address issuer;
    bytes32 acquirerHash;
    uint256 amount;
    uint256 fee;
    uint256 issuerMargin;
    uint256 poolCoverage;
    uint64 maturity;
    uint32 termsVersion;
    PositionState state;
}

/// @notice One LP withdrawal priced from the current pool NAV.
/// @dev Principal is the requested LP principal; the other fields snapshot its
///      proportional fee/loss shares so a pending withdrawal is settled once.
struct LpWithdrawal {
    uint256 principal;
    uint256 paid;
    uint256 pending;
}

/// @notice Registration metadata only; collateral and operational status are not stored here.
struct IssuerRegistration {
    bool exists;
    uint64 registeredAt;
    bytes32 acquirerHash;
    string name;
}

/// @notice Action-specific authorization, independent of token Permit and AdvanceRequest nonces.
struct CollateralDepositRequest {
    address issuer;
    uint256 amount;
    uint256 nonce;
    uint256 deadline;
}

/// @notice Full-principal repayment authorized by the issuer for one position.
/// @dev Replay protection is both per-issuer nonce and the position's terminal Repaid state.
struct RepaymentRequest {
    bytes32 refundKey;
    address issuer;
    uint256 amount;
    uint256 nonce;
    uint256 deadline;
}

/// @notice Permit owner/spender/value are fixed by the deposit, never arbitrary caller inputs.
struct PermitSignature {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}

error InvalidAddress();
error InvalidAsset(address asset);
error InvalidAssetDecimals(uint8 decimals);
error InvalidIssuerCount();
