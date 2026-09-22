// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Pure loss allocation only. Recovery and stateful collateral accounting remain pending.
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
}
