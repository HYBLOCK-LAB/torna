// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { Limits } from "../src/libraries/Limits.sol";
import { InvalidIssuerCount } from "../src/TornaTypes.sol";

contract LimitsHarness {
    function effectiveLimit(uint256 collateral, uint256 capacity, uint256 count, bool ramp)
        external
        pure
        returns (uint256)
    {
        return Limits.effectiveLimit(collateral, capacity, count, ramp);
    }
}

contract LimitsTest is Test {
    function testOneTwoAndFiveIssuerConcentration() public pure {
        assertEq(Limits.effectiveLimit(3000e6, 10_000e6, 1, false), 10_000e6);
        assertEq(Limits.effectiveLimit(3000e6, 10_000e6, 2, false), 5000e6);
        assertEq(Limits.effectiveLimit(3000e6, 10_000e6, 5, false), 4000e6);
    }

    function testCollateralAndRampUpLimit() public pure {
        assertEq(Limits.effectiveLimit(600e6, 10_000e6, 2, false), 4000e6);
        assertEq(Limits.effectiveLimit(600e6, 10_000e6, 2, true), 2000e6);
        assertEq(Limits.effectiveLimit(0, 10_000e6, 2, false), 0);
        assertEq(Limits.effectiveLimit(600e6, 0, 2, false), 0);
    }

    function testNoIssuerCountReverts() public {
        LimitsHarness harness = new LimitsHarness();
        vm.expectRevert(InvalidIssuerCount.selector);
        harness.effectiveLimit(600e6, 10_000e6, 0, false);
    }

    function testCapacityExcludesExternalDeploymentOnce() public pure {
        uint256 capacity = 7643.68e6 - 3638.88e6;
        assertEq(Limits.effectiveLimit(2800e6, capacity, 5, false), 1601.92e6);
        assertEq(Limits.acquirerRoom(capacity, 1000e6), 1002.4e6);
    }

    function testExistingExposureAboveCapHasNoNewRoom() public pure {
        assertEq(Limits.acquirerRoom(10_000e6, 4999e6), 1e6);
        assertEq(Limits.acquirerRoom(10_000e6, 5000e6), 0);
        assertEq(Limits.acquirerRoom(10_000e6, 6000e6), 0);
    }

    function testDepositFloorAndOutstandingBasedCap() public pure {
        assertEq(Limits.depositCap(0), 16_666_666_666);
        assertEq(Limits.depositCap(5000e6), 16_666_666_666);
        assertEq(Limits.depositCap(6000e6), 20_000e6);
    }

    function testStrictFormulaExposesBootstrapConflict() public pure {
        uint256 room = Limits.depositRoom(0, 0, 0);
        assertEq(room, 4_166_666_666);
        assertLt(room, 5000e6);
    }

    function testDepositRoomUsesBothCapsAndZeroWhenExceeded() public pure {
        assertEq(Limits.depositRoom(8000e6, 0, 0), 4_166_666_666);
        assertEq(Limits.depositRoom(16_500e6, 0, 0), 166_666_666);
        assertEq(Limits.depositRoom(16_667e6, 0, 0), 0);
        assertEq(Limits.depositRoom(10_000e6, 5000e6, 0), 0);
    }

    function testFuzzDepositRoomCannotExceedEitherCap(
        uint96 outstanding,
        uint96 total,
        uint96 individual
    ) public pure {
        uint256 cap = Limits.depositCap(outstanding);
        uint256 room = Limits.depositRoom(total, individual, outstanding);
        uint256 individualCap = cap / 4;
        assertLe(room, Limits.remaining(cap, total));
        assertLe(room, Limits.remaining(individualCap, individual));
        if (room > 0) {
            assertLe(uint256(total) + room, cap);
            assertLe(uint256(individual) + room, individualCap);
        }
    }

    function testFuzzRampUpCannotIncreaseLimit(uint96 collateral, uint96 capacity, uint8 count)
        public
        pure
    {
        uint256 issuerCount = uint256(count) + 1;
        uint256 normal = Limits.effectiveLimit(collateral, capacity, issuerCount, false);
        uint256 ramp = Limits.effectiveLimit(collateral, capacity, issuerCount, true);
        assertLe(ramp, normal);
        assertLe(normal, capacity);
    }
}
