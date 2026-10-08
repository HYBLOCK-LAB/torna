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

    function testT3SequenceRecognizes1600AndHolds1600() public pure {
        uint256 cap = Waterfall.eventCap(10_000e6);
        uint256 recognized;
        uint256 capHeld;

        for (uint256 i; i < 4; ++i) {
            uint256 coverage = 800e6;
            if (Waterfall.applyCap(recognized, coverage, cap)) {
                recognized += coverage;
            } else {
                capHeld += coverage;
            }
        }

        assertEq(recognized, 1600e6);
        assertEq(capHeld, 1600e6);
    }

    function testCapComparisonCannotOverflow() public pure {
        assertFalse(Waterfall.applyCap(type(uint256).max, 1, type(uint256).max));
    }

    function testT3bRecoveryIncludesPreviouslyAppliedMarginWithoutDoubleCharge() public pure {
        Waterfall.RecoverySettlement memory result =
            Waterfall.settleRecovery(4000e6, 800e6, 2200e6, 200e6, 400e6, 0, 1600e6, 0);
        assertEq(result.unrecovered, 1800e6);
        assertEq(result.marginRequired, 800e6);
        assertEq(result.marginApplied, 600e6);
        assertEq(result.additionalMarginApplied, 200e6);
        assertEq(result.marginRestored, 0);
        assertEq(result.poolNeed, 1000e6);
        assertEq(result.collateralShortfall, 200e6);
        assertEq(result.finalPoolLoss, 1200e6);
        assertEq(result.lpRestored, 400e6);
        assertEq(result.reserveRestored, 0);
        assertEq(result.reserveApplied, 0);
        assertEq(result.lpApplied, 0);
        assertEq(result.marginApplied + result.finalPoolLoss, result.unrecovered);
    }

    function testFullRecoveryRestoresLpThenReserveAndPreviouslyAppliedMargin() public pure {
        Waterfall.RecoverySettlement memory result =
            Waterfall.settleRecovery(1000e6, 200e6, 1000e6, 0, 200e6, 500e6, 300e6, 0);
        assertEq(result.unrecovered, 0);
        assertEq(result.marginApplied, 0);
        assertEq(result.marginRestored, 200e6);
        assertEq(result.finalPoolLoss, 0);
        assertEq(result.lpRestored, 300e6);
        assertEq(result.reserveRestored, 500e6);
        assertEq(result.reserveApplied + result.lpApplied, 0);
    }

    function testPartialRecoveryRestoresLpBeforeReserve() public pure {
        Waterfall.RecoverySettlement memory result =
            Waterfall.settleRecovery(1000e6, 200e6, 500e6, 0, 0, 500e6, 300e6, 0);
        assertEq(result.finalPoolLoss, 500e6);
        assertEq(result.lpRestored, 300e6);
        assertEq(result.reserveRestored, 0);
        assertEq(result.reserveApplied + result.lpApplied, 0);
    }

    function testWorseRecoveryAbsorbsOnlyDeltaReserveFirstThenLp() public pure {
        Waterfall.RecoverySettlement memory result =
            Waterfall.settleRecovery(1000e6, 200e6, 0, 0, 0, 100e6, 300e6, 50e6);
        assertEq(result.marginRequired, 200e6);
        assertEq(result.marginApplied, 0);
        assertEq(result.collateralShortfall, 200e6);
        assertEq(result.poolNeed, 800e6);
        assertEq(result.finalPoolLoss, 1000e6);
        assertEq(result.reserveApplied, 50e6);
        assertEq(result.lpApplied, 550e6);
        assertEq(result.lpRestored + result.reserveRestored, 0);
    }

    function testRecoveryAbovePrincipalReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(Waterfall.RecoveryExceedsPrincipal.selector, 1000e6, 1000e6 + 1)
        );
        this.settleInvalidRecovery();
    }

    function settleInvalidRecovery() external pure {
        Waterfall.settleRecovery(1000e6, 200e6, 1000e6 + 1, 0, 0, 0, 0, 0);
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

    function testFuzzRecoveryConservesFinalLossAndUsesReverseRestorationOrder(
        uint96 principalInput,
        uint96 recoveredInput,
        uint96 collateralInput,
        uint96 priorMarginInput,
        uint96 recognizedReserveInput,
        uint96 recognizedLpInput,
        uint96 reserveInput
    ) public pure {
        uint256 principal = principalInput;
        uint256 recovered = bound(recoveredInput, 0, principal);
        uint256 totalMargin = principal / 5;
        uint256 priorMargin = bound(priorMarginInput, 0, totalMargin);
        Waterfall.RecoverySettlement memory result = Waterfall.settleRecovery(
            principal,
            totalMargin,
            recovered,
            collateralInput,
            priorMargin,
            recognizedReserveInput,
            recognizedLpInput,
            reserveInput
        );

        assertEq(result.marginApplied + result.finalPoolLoss, result.unrecovered);
        assertEq(
            result.additionalMarginApplied + priorMargin,
            result.marginApplied + result.marginRestored
        );
        uint256 recognized = uint256(recognizedReserveInput) + uint256(recognizedLpInput);
        if (recognized >= result.finalPoolLoss) {
            assertEq(result.lpRestored + result.reserveRestored, recognized - result.finalPoolLoss);
            assertLe(result.lpRestored, recognizedLpInput);
            if (result.reserveRestored > 0) assertEq(result.lpRestored, recognizedLpInput);
            assertEq(result.reserveApplied + result.lpApplied, 0);
        } else {
            assertEq(result.reserveApplied + result.lpApplied, result.finalPoolLoss - recognized);
            assertLe(result.reserveApplied, reserveInput);
            if (result.lpApplied > 0) assertEq(result.reserveApplied, reserveInput);
            assertEq(result.lpRestored + result.reserveRestored, 0);
        }
    }
}
