// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { InvalidAddress } from "../src/TornaTypes.sol";

/// @notice Real MockUSDC transfers prove that t6 liquidity leaves Torna.
contract IdleDeploymentTest is ProtocolFixture {
    address private vault;
    address private treasury;

    event IdleDeployed(uint256 amount);
    event IdleWithdrawFailed(uint256 amount);

    function setUp() public override {
        super.setUp();
        vault = makeAddr("external-idle-vault");
        treasury = makeAddr("separate-treasury");
        vm.startPrank(admin);
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        torna.setIdleVault(vault);
        torna.grantRole(torna.TREASURY_ROLE(), treasury);
        vm.stopPrank();
        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }
    }

    function testActualDeploymentAndNaturalFailedRecallFreeze() public {
        uint256 amount = 3_000e6;
        uint256 poolBefore = token.balanceOf(address(torna));
        assertEq(torna.netAssetValue(), 10_000e6);

        vm.expectEmit(false, false, false, true, address(torna));
        emit IdleDeployed(amount);
        vm.prank(treasury);
        torna.deployIdle(amount);

        assertEq(token.balanceOf(address(torna)), poolBefore - amount);
        assertEq(token.balanceOf(vault), amount);
        assertEq(torna.externalDeployed(), amount);
        assertEq(torna.netAssetValue(), 10_000e6);
        assertEq(torna.poolCapacity(), 7_000e6);
        assertEq(torna.poolCash(), 7_000e6);

        // The EOA deliberately did not approve Torna; MockUSDC transferFrom reverts.
        assertEq(token.allowance(vault, address(torna)), 0);
        vm.expectEmit(false, false, false, true, address(torna));
        emit IdleWithdrawFailed(amount);
        vm.prank(treasury);
        torna.recallIdle(amount);

        assertTrue(torna.externalFrozen());
        assertEq(torna.externalDeployed(), amount);
        assertEq(token.balanceOf(address(torna)), poolBefore - amount);
        assertEq(token.balanceOf(vault), amount);
        assertEq(torna.netAssetValue(), 10_000e6);
        assertEq(torna.poolCapacity(), 7_000e6);

        vm.expectRevert(Torna.IdleFrozen.selector);
        vm.prank(treasury);
        torna.deployIdle(1);
    }

    function testContractEnforcesNavHalfCapAndAvailableCash() public {
        vm.expectRevert(
            abi.encodeWithSelector(Torna.IdleCapExceeded.selector, 5_000e6, 5_000e6 + 1)
        );
        vm.prank(treasury);
        torna.deployIdle(5_000e6 + 1);

        vm.prank(treasury);
        torna.deployIdle(4_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.IdleCapExceeded.selector, 5_000e6, 5_000e6 + 1)
        );
        vm.prank(treasury);
        torna.deployIdle(1_000e6 + 1);

        vm.prank(treasury);
        torna.deployIdle(1_000e6);
        assertEq(torna.externalDeployed(), 5_000e6);
        assertEq(token.balanceOf(vault), 5_000e6);
    }

    function testTreasuryRoleIsSeparateAndVaultMustBeEoa() public {
        vm.expectRevert();
        vm.prank(admin);
        torna.deployIdle(1e6);

        vm.expectRevert();
        vm.prank(admin);
        torna.recallIdle(1e6);

        Torna other = new Torna(token, admin, verifier, submitter);
        vm.expectRevert(InvalidAddress.selector);
        vm.prank(admin);
        other.setIdleVault(address(token));

        vm.expectRevert(Torna.IdleVaultAlreadyConfigured.selector);
        vm.prank(admin);
        torna.setIdleVault(makeAddr("another-vault"));
    }

    function testApprovedRecallRestoresCashAndReducesExternalBalance() public {
        vm.prank(treasury);
        torna.deployIdle(3_000e6);
        vm.prank(vault);
        token.approve(address(torna), 1_000e6);

        vm.prank(treasury);
        torna.recallIdle(1_000e6);

        assertEq(token.balanceOf(vault), 2_000e6);
        assertEq(token.balanceOf(address(torna)), 8_000e6);
        assertEq(torna.externalDeployed(), 2_000e6);
        assertEq(torna.poolCapacity(), 8_000e6);
        assertEq(torna.netAssetValue(), 10_000e6);
        assertFalse(torna.externalFrozen());
    }
}
