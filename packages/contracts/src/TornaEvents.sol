// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Wire events for registration, funding, advances, repayment and loss review.
abstract contract TornaEvents {
    event IssuerRegistered(address indexed issuer, bytes32 acquirerHash, string name);
    event CollateralDeposited(address indexed issuer, uint256 amount);
    event ReserveSeeded(uint256 amount);
    event IssuerMarginCall(address indexed issuer);
    event IssuerSuspended(address indexed issuer);
    event AdvanceIssued(
        bytes32 indexed refundKey, address indexed issuer, uint256 amount, uint64 maturity
    );
    event AdvanceRejected(bytes32 indexed refundKey, uint8 reason);
    event AdvanceRepaid(bytes32 indexed refundKey, uint256 amount);
    event MarkedOverdue(bytes32 indexed refundKey);
    event ReviewOpened(bytes32 indexed refundKey, string evidence);
    event CoveredLossFinalized(bytes32 indexed refundKey, uint256 coverage);
    event CorrelatedExposureFlagged(bytes32 indexed acquirerHash, uint256 principal);
    event LossCapTriggered(bytes32 indexed acquirerHash, uint256 cap);
    event RecoveryRecorded(bytes32 indexed refundKey, uint256 recovered);
    event LiquidityDeposited(address indexed lp, uint256 amount);
    event DepositRejected(address indexed lp, uint256 amount, uint8 reason);
    event WithdrawRequested(address indexed lp, uint256 amount);
    event WithdrawPaid(address indexed lp, uint256 amount);
    event WithdrawCompleted(address indexed lp, uint256 amount);
    event IdleDeployed(uint256 amount);
    event IdleWithdrawFailed(uint256 amount);
    event LedgerCreditConfirmed(bytes32 indexed refundKey);
}
