// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { Waterfall } from "../src/libraries/Waterfall.sol";

contract WaterfallTest is Test {
    function testT2FullLossAllocation() public pure {
        Waterfall.Allocation memory allocation = Waterfall.absorb(1000e6, 3000e6, 646.4e6);
        assertEq(allocation.marginRequired, 200e6);
        assertEq(allocation.marginApplied, 200e6);
        assertEq(allocation.reserveApplied, 646.4e6);
        assertEq(allocation.lpApplied, 153.6e6);
    }

    function testCollateralShortfallFallsThroughToPool() public pure {
        Waterfall.Allocation memory allocation = Waterfall.absorb(1000e6, 100e6, 50e6);
        assertEq(allocation.marginRequired, 200e6);
        assertEq(allocation.marginApplied, 100e6);
        assertEq(allocation.reserveApplied, 50e6);
        assertEq(allocation.lpApplied, 850e6);
    }

    function testReserveNeverAbsorbsMoreThanPoolNeed() public pure {
        Waterfall.Allocation memory allocation = Waterfall.absorb(1000e6, 3000e6, 2000e6);
        assertEq(allocation.reserveApplied, 800e6);
        assertEq(allocation.lpApplied, 0);
    }

    function testNoCollateralOrReserveAndZeroLoss() public pure {
        Waterfall.Allocation memory allocation = Waterfall.absorb(1000e6, 0, 0);
        assertEq(allocation.lpApplied, 1000e6);
        allocation = Waterfall.absorb(0, 3000e6, 500e6);
        assertEq(allocation.marginApplied + allocation.reserveApplied + allocation.lpApplied, 0);
    }

    function testCapHoldsWholePositions() public pure {
        uint256 cap = Waterfall.eventCap(10_000e6);
        assertEq(cap, 2000e6);
        assertTrue(Waterfall.applyCap(0, 800e6, cap));
        assertTrue(Waterfall.applyCap(800e6, 800e6, cap));
        assertFalse(Waterfall.applyCap(1600e6, 800e6, cap));
        assertTrue(Waterfall.applyCap(1200e6, 800e6, cap));
        assertFalse(Waterfall.applyCap(2001e6, 1e6, cap));
    }

    function testCapComparisonCannotOverflow() public pure {
        assertFalse(Waterfall.applyCap(type(uint256).max, 1, type(uint256).max));
    }

    function testFuzzConservationAndAbsorptionOrder(
        uint96 amount,
        uint96 collateral,
        uint96 reserve
    ) public pure {
        Waterfall.Allocation memory allocation = Waterfall.absorb(amount, collateral, reserve);
        assertEq(
            allocation.marginApplied + allocation.reserveApplied + allocation.lpApplied, amount
        );
        assertLe(allocation.marginApplied, collateral);
        assertLe(allocation.marginApplied, allocation.marginRequired);
        assertLe(allocation.reserveApplied, reserve);
        if (allocation.lpApplied > 0) assertEq(allocation.reserveApplied, reserve);
    }

    function testFuzzCapAcceptanceIsBounded(uint96 recognized, uint96 coverage, uint96 cap)
        public
        pure
    {
        assertEq(
            Waterfall.applyCap(recognized, coverage, cap),
            uint256(recognized) + uint256(coverage) <= uint256(cap)
        );
    }
}
