// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Pure loss and recovery calculations. Stateful position accounting remains in Torna.
library Waterfall {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant ISSUER_LOSS_BPS = 2000;
    uint256 internal constant EVENT_CAP_BPS = 2000;

    struct Allocation {
        uint256 marginRequired;
        uint256 marginApplied;
        uint256 reserveApplied;
        uint256 lpApplied;
    }

    struct RecoverySettlement {
        uint256 unrecovered;
        uint256 marginRequired;
        uint256 marginApplied;
        uint256 additionalMarginApplied;
        uint256 marginRestored;
        uint256 poolNeed;
        uint256 collateralShortfall;
        uint256 finalPoolLoss;
        uint256 lpRestored;
        uint256 reserveRestored;
        uint256 reserveApplied;
        uint256 lpApplied;
    }

    struct RecoveryInput {
        uint256 principal;
        uint256 totalMargin;
        uint256 recovered;
        uint256 collateralAvailable;
        uint256 priorMarginApplied;
        uint256 recognizedReserve;
        uint256 recognizedLp;
        uint256 reserveAvailable;
    }

    error RecoveryExceedsPrincipal(uint256 principal, uint256 recovered);

    /// @notice Allocate a newly confirmed full loss, given available collateral and reserve.
    /// @dev Does not run for CapHeld positions or settle previously recognized/recovered losses.
    function absorb(uint256 amount, uint256 collateralAvailable, uint256 reserveAvailable)
        internal
        pure
        returns (Allocation memory result)
    {
        result.marginRequired = Math.mulDiv(amount, ISSUER_LOSS_BPS, BPS);
        result.marginApplied = Math.min(result.marginRequired, collateralAvailable);
        uint256 poolNeed = amount - result.marginApplied;
        result.reserveApplied = Math.min(poolNeed, reserveAvailable);
        result.lpApplied = poolNeed - result.reserveApplied;
    }

    function eventCap(uint256 lpDeposits) internal pure returns (uint256) {
        return Math.mulDiv(lpDeposits, EVENT_CAP_BPS, BPS);
    }

    /// @notice Admit the WHOLE coverage or hold it; never split a position to fill the cap.
    /// @dev Caller supplies event scope, nominal coverage and the agreed cap snapshot.
    function applyCap(uint256 recognized, uint256 coverage, uint256 cap)
        internal
        pure
        returns (bool covered)
    {
        return recognized <= cap && coverage <= cap - recognized;
    }

    /// @notice Reconcile one event's final loss after an aggregate recovery.
    /// @dev `priorMarginApplied` is collateral already deducted before recovery. Adding it
    /// back to current collateral prevents charging the same issuer margin twice.
    function settleRecovery(
        uint256 principal,
        uint256 totalMargin,
        uint256 recovered,
        uint256 collateralAvailable,
        uint256 priorMarginApplied,
        uint256 recognizedReserve,
        uint256 recognizedLp,
        uint256 reserveAvailable
    ) internal pure returns (RecoverySettlement memory result) {
        return settleRecovery(
            RecoveryInput({
                principal: principal,
                totalMargin: totalMargin,
                recovered: recovered,
                collateralAvailable: collateralAvailable,
                priorMarginApplied: priorMarginApplied,
                recognizedReserve: recognizedReserve,
                recognizedLp: recognizedLp,
                reserveAvailable: reserveAvailable
            })
        );
    }

    function settleRecovery(RecoveryInput memory input)
        internal
        pure
        returns (RecoverySettlement memory result)
    {
        uint256 principal = input.principal;
        uint256 totalMargin = input.totalMargin;
        uint256 recovered = input.recovered;
        uint256 collateralAvailable = input.collateralAvailable;
        uint256 priorMarginApplied = input.priorMarginApplied;
        uint256 recognizedReserve = input.recognizedReserve;
        uint256 recognizedLp = input.recognizedLp;
        uint256 reserveAvailable = input.reserveAvailable;
        if (recovered > principal) {
            revert RecoveryExceedsPrincipal(principal, recovered);
        }

        result.unrecovered = principal - recovered;
        result.marginRequired = Math.min(totalMargin, result.unrecovered);
        uint256 totalIssuerCapacity = Math.saturatingAdd(collateralAvailable, priorMarginApplied);
        result.marginApplied = Math.min(result.marginRequired, totalIssuerCapacity);
        if (result.marginApplied >= priorMarginApplied) {
            result.additionalMarginApplied = result.marginApplied - priorMarginApplied;
        } else {
            result.marginRestored = priorMarginApplied - result.marginApplied;
        }

        result.poolNeed = result.unrecovered - result.marginRequired;
        result.collateralShortfall = result.marginRequired - result.marginApplied;
        result.finalPoolLoss = result.poolNeed + result.collateralShortfall;

        uint256 recognizedPoolLoss = Math.saturatingAdd(recognizedReserve, recognizedLp);
        if (recognizedPoolLoss >= result.finalPoolLoss) {
            uint256 restored = recognizedPoolLoss - result.finalPoolLoss;
            result.lpRestored = Math.min(restored, recognizedLp);
            result.reserveRestored = restored - result.lpRestored;
        } else {
            uint256 additional = result.finalPoolLoss - recognizedPoolLoss;
            result.reserveApplied = Math.min(additional, reserveAvailable);
            result.lpApplied = additional - result.reserveApplied;
        }
    }
}
