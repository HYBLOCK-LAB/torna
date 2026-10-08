// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { InvalidIssuerCount } from "../TornaTypes.sol";

/// @notice Pure formulas from PRD section 7. No bootstrap exceptions or issuer counting policy.
library Limits {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant COLLATERAL_BPS = 1500;
    uint256 internal constant ISSUER_CONCENTRATION_BPS = 4000;
    uint256 internal constant ACQUIRER_EXPOSURE_BPS = 5000;
    uint256 internal constant LP_CONCENTRATION_BPS = 2500;
    uint256 internal constant TARGET_UTILIZATION_BPS = 3000;
    uint256 internal constant RAMP_BPS = 5000;
    uint256 internal constant OUTSTANDING_FLOOR = 5000e6;

    function effectiveLimit(
        uint256 collateral,
        uint256 poolCapacity,
        uint256 issuerCount,
        bool rampUp
    ) internal pure returns (uint256) {
        if (issuerCount == 0) revert InvalidIssuerCount();
        uint256 collateralLimit = Math.mulDiv(collateral, rampUp ? RAMP_BPS : BPS, COLLATERAL_BPS);
        uint256 concentration = Math.max(ISSUER_CONCENTRATION_BPS, BPS / issuerCount);
        return Math.min(collateralLimit, Math.mulDiv(poolCapacity, concentration, BPS));
    }

    function acquirerRoom(uint256 poolCapacity, uint256 outstanding)
        internal
        pure
        returns (uint256)
    {
        return remaining(Math.mulDiv(poolCapacity, ACQUIRER_EXPOSURE_BPS, BPS), outstanding);
    }

    /// @dev Uses current outstanding as specified by the detailed formula, not a moving average.
    function depositCap(uint256 outstanding) internal pure returns (uint256) {
        return Math.mulDiv(Math.max(outstanding, OUTSTANDING_FLOOR), BPS, TARGET_UTILIZATION_BPS);
    }

    /// @notice Maximum additional amount allowed by BOTH pool and individual LP caps.
    function depositRoom(uint256 totalDeposits, uint256 lpDeposits, uint256 outstanding)
        internal
        pure
        returns (uint256)
    {
        uint256 cap = depositCap(outstanding);
        return Math.min(
            remaining(cap, totalDeposits),
            remaining(Math.mulDiv(cap, LP_CONCENTRATION_BPS, BPS), lpDeposits)
        );
    }

    /// @dev Limits on new actions do not forcibly unwind existing exposure.
    function remaining(uint256 limit, uint256 used) internal pure returns (uint256) {
        return used >= limit ? 0 : limit - used;
    }
}
