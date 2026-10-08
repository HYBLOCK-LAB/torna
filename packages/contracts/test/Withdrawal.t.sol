// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { AdvanceRequest, CollateralDepositRequest, RepaymentRequest } from "../src/TornaTypes.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

contract WithdrawalTest is ProtocolFixture {
    bytes32 internal constant ACQUIRER = keccak256(bytes("ACQ-W"));

    event WithdrawRequested(address indexed lp, uint256 amount);
    event WithdrawPaid(address indexed lp, uint256 amount);
    event WithdrawCompleted(address indexed lp, uint256 amount);

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        torna.registerIssuer(issuers[0], ACQUIRER, "HYBRID");
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }

        _depositCollateral(3_000e6);
        vm.warp(block.timestamp + 30 days);
        vm.prank(issuers[0]);
        token.approve(address(torna), type(uint256).max);
    }

    function testImmediatePaymentAndRepaymentReleasePendingExit() public {
        for (uint256 i; i < 4; ++i) {
            _issue(i + 1);
        }

        uint256 expectedImmediate = 1_201_920_000;
        uint256 expectedPending = 800e6;

        uint256 lpBalanceBefore = token.balanceOf(lps[2]);
        vm.expectEmit(true, false, false, true, address(torna));
        emit WithdrawRequested(lps[2], 2_000e6);
        vm.prank(lps[2]);
        (uint256 paid, uint256 waiting) = torna.requestWithdraw(2_000e6);

        assertEq(paid, expectedImmediate);
        assertEq(waiting, expectedPending);
        assertEq(token.balanceOf(lps[2]), lpBalanceBefore);
        assertEq(torna.poolCapacity(), 10_009_600_000);

        vm.expectEmit(true, false, false, true, address(torna));
        emit WithdrawPaid(lps[2], expectedImmediate);
        torna.processWithdrawal();
        assertEq(token.balanceOf(lps[2]), lpBalanceBefore + expectedImmediate);
        assertEq(torna.lpPrincipal(lps[2]), 2_000e6);
        assertEq(torna.poolCapacity(), 8_807_680_000);

        for (uint256 i; i < 3; ++i) {
            _repay(i + 1);
        }

        // Completion happened during the repayment transaction; no second LP
        // transaction is required.
        assertEq(torna.lpPrincipal(lps[2]), 0);
        assertEq(torna.totalLpPrincipal(), 8_000e6);
        assertEq(torna.totalLpFees(), 7_680_000);
        assertEq(torna.totalLpLoss(), 0);
        assertEq(torna.poolCapacity(), 8_007_680_000);
        assertEq(torna.totalOutstanding(), 1_000e6);
    }

    function testCompletedExitRemovesTheLpShareOfCurrentLoss() public {
        _issue(99);
        vm.warp(block.timestamp + 2 days);
        vm.prank(verifier);
        torna.openReview(_key(99), "settlement not received");
        vm.prank(verifier);
        torna.finalizeCoveredLoss(_key(99));

        uint256 lossBefore = torna.totalLpLoss();
        assertEq(lossBefore, 799_601_000);
        assertEq(torna.totalLoss(), 1_000e6);
        vm.prank(lps[2]);
        torna.requestWithdraw(2_000e6);
        torna.processWithdrawal();

        uint256 lossShare = Math.mulDiv(lossBefore, 2_000e6, 10_000e6);
        assertEq(torna.totalLpLoss(), lossBefore - lossShare);
        assertEq(torna.totalLoss(), 840_079_800);
        assertEq(torna.lpPrincipal(lps[2]), 0);
        assertEq(torna.totalLpPrincipal(), 8_000e6);
    }

    function testCannotCreateTwoActiveRequestsOrExceedPrincipal() public {
        vm.prank(lps[2]);
        vm.expectRevert();
        torna.requestWithdraw(2_001e6);

        _issue(100);
        vm.prank(lps[2]);
        torna.requestWithdraw(1_000e6);
        vm.prank(lps[2]);
        vm.expectRevert();
        torna.requestWithdraw(1_000e6);
    }

    function _depositCollateral(uint256 amount) private {
        CollateralDepositRequest memory request = CollateralDepositRequest({
            issuer: issuers[0],
            amount: amount,
            nonce: torna.collateralDepositNonces(issuers[0]),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, torna.hashCollateralDeposit(request));
        vm.prank(issuers[0]);
        token.approve(address(torna), amount);
        vm.prank(submitter);
        torna.depositCollateral(request, abi.encodePacked(r, s, v));
    }

    function _issue(uint256 salt) private {
        AdvanceRequest memory request = AdvanceRequest({
            refundKey: _key(salt),
            issuer: issuers[0],
            acquirerHash: ACQUIRER,
            amount: 1_000e6,
            maturity: SafeCast.toUint64(block.timestamp + 1 days),
            nonce: torna.advanceNonces(issuers[0]),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, torna.hashAdvanceRequest(request));
        vm.prank(submitter);
        assertTrue(torna.advance(request, abi.encodePacked(r, s, v)));
    }

    function _repay(uint256 salt) private {
        RepaymentRequest memory request = RepaymentRequest({
            refundKey: _key(salt),
            issuer: issuers[0],
            amount: 1_000e6,
            nonce: torna.repaymentNonces(issuers[0]),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, torna.hashRepaymentRequest(request));
        vm.prank(submitter);
        torna.repay(request, abi.encodePacked(r, s, v));
    }

    function _key(uint256 salt) private pure returns (bytes32) {
        return keccak256(abi.encode("withdrawal", salt));
    }
}
