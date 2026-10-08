// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { DepositRejection } from "../src/TornaTypes.sol";

contract LiquidityDepositTest is ProtocolFixture {
    event LiquidityDeposited(address indexed lp, uint256 amount);
    event DepositRejected(address indexed lp, uint256 amount, uint8 reason);

    function setUp() public override {
        super.setUp();
        vm.prank(admin);
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        _fundInitialLp(lps[0]);
        _fundInitialLp(lps[1]);
        _fundInitialLp(lps[2]);
    }

    function testPartiallyAcceptsNewLpAtIndividualConcentrationCap() public {
        uint256 requestAmount = 12_000e6;
        uint256 accepted = 4_166_666_666;
        uint256 rejected = requestAmount - accepted;
        uint256 balanceBefore = token.balanceOf(lps[3]);
        _approve(lps[3], requestAmount);

        vm.expectEmit(true, false, false, true, address(torna));
        emit LiquidityDeposited(lps[3], accepted);
        vm.expectEmit(true, false, false, true, address(torna));
        emit DepositRejected(lps[3], rejected, uint8(DepositRejection.ConcentrationExceeded));
        vm.prank(lps[3]);
        assertEq(torna.depositLiquidity(requestAmount), accepted);

        assertEq(torna.lpPrincipal(lps[3]), accepted);
        assertEq(torna.totalLpPrincipal(), 14_166_666_666);
        assertEq(token.balanceOf(lps[3]), balanceBefore - accepted);
        assertEq(torna.liquidityDepositRoom(lps[3]), 0);
    }

    function testPoolCapPartiallyAcceptsAfterAnotherLpsConcentrationRoomIsFilled() public {
        _approve(lps[3], 12_000e6);
        vm.prank(lps[3]);
        torna.depositLiquidity(12_000e6);

        uint256 requestAmount = 12_000e6;
        uint256 accepted = 2_500e6;
        uint256 rejected = requestAmount - accepted;
        _approve(lps[4], requestAmount);
        vm.expectEmit(true, false, false, true, address(torna));
        emit LiquidityDeposited(lps[4], accepted);
        vm.expectEmit(true, false, false, true, address(torna));
        emit DepositRejected(lps[4], rejected, uint8(DepositRejection.DepositCapExceeded));
        vm.prank(lps[4]);
        assertEq(torna.depositLiquidity(requestAmount), accepted);

        assertEq(torna.totalLpPrincipal(), limitsDepositCap());
        assertEq(torna.liquidityDepositRoom(lps[5]), 0);
    }

    function testFullyRejectedRequestDoesNotMoveTokensOrCreatePrincipal() public {
        uint256 amount = 1e6;
        uint256 balanceBefore = token.balanceOf(lps[0]);
        _approve(lps[0], amount);
        vm.expectEmit(true, false, false, true, address(torna));
        emit DepositRejected(lps[0], amount, uint8(DepositRejection.ConcentrationExceeded));
        vm.prank(lps[0]);
        assertEq(torna.depositLiquidity(amount), 0);

        assertEq(token.balanceOf(lps[0]), balanceBefore);
        assertEq(torna.lpPrincipal(lps[0]), 5000e6);
        assertEq(torna.totalLpPrincipal(), 10_000e6);
    }

    function testRejectsZeroAmountAndCannotBypassBootstrapReadiness() public {
        vm.prank(lps[3]);
        vm.expectRevert(Torna.InvalidLiquidityAmount.selector);
        torna.depositLiquidity(0);

        Torna unready = new Torna(token, admin, verifier, submitter);
        vm.prank(lps[3]);
        token.approve(address(unready), 1e6);
        vm.prank(lps[3]);
        vm.expectRevert(Torna.LiquidityNotReady.selector);
        unready.depositLiquidity(1e6);
    }

    function _fundInitialLp(address lp) private {
        uint256 amount = torna.initialLiquidityAllocation(lp);
        _approve(lp, amount);
        vm.prank(lp);
        torna.depositInitialLiquidity(amount);
    }

    function _approve(address lp, uint256 amount) private {
        vm.prank(lp);
        token.approve(address(torna), amount);
    }

    function limitsDepositCap() private pure returns (uint256) {
        return 16_666_666_666;
    }
}
