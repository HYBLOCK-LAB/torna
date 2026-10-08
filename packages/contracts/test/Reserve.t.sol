// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { TornaEvents } from "../src/TornaEvents.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

contract ReserveTest is ProtocolFixture {
    function setUp() public override {
        vm.chainId(10143);
        admin = makeAddr("reserve-admin");
        verifier = makeAddr("reserve-verifier");
        submitter = makeAddr("reserve-submitter");
        token = new MockUSDC(admin);
        torna = new Torna(token, admin, verifier, submitter);
        vm.prank(admin);
        token.mint(admin, 1000e6);
    }

    function testAdminSeedsExactReserveOnceAndKeepsItOutsidePoolCapacity() public {
        vm.startPrank(admin);
        token.approve(address(torna), torna.RESERVE_SEED());
        vm.expectEmit(false, false, false, true, address(torna));
        emit TornaEvents.ReserveSeeded(torna.RESERVE_SEED());
        torna.seedReserve(torna.RESERVE_SEED());
        vm.stopPrank();

        assertEq(torna.reserveBalance(), 500e6);
        assertTrue(torna.reserveSeeded());
        assertEq(torna.poolCapacity(), 0);
        assertEq(token.balanceOf(address(torna)), 500e6);
    }

    function testOnlyAdminCanSeedAndSeedCannotRepeat() public {
        uint256 seed = torna.RESERVE_SEED();
        bytes memory unauthorized = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector,
            verifier,
            torna.DEFAULT_ADMIN_ROLE()
        );
        vm.prank(verifier);
        vm.expectRevert(unauthorized);
        torna.seedReserve(seed);

        vm.startPrank(admin);
        token.approve(address(torna), seed);
        torna.seedReserve(seed);
        vm.expectRevert(Torna.ReserveAlreadySeeded.selector);
        torna.seedReserve(seed);
        vm.stopPrank();
    }

    function testWrongAmountAndInsufficientAllowanceDoNotChangeReserve() public {
        uint256 seed = torna.RESERVE_SEED();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Torna.InvalidReserveSeedAmount.selector, seed, 1));
        torna.seedReserve(1);

        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InsufficientReserveSeedAllowance.selector, 0, seed)
        );
        torna.seedReserve(seed);
        assertEq(torna.reserveBalance(), 0);
        assertFalse(torna.reserveSeeded());
    }
}
