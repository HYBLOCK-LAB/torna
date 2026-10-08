// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import {
    AdvanceRequest,
    CollateralDepositRequest,
    PositionState,
    RepaymentRequest
} from "../src/TornaTypes.sol";

/// @notice The chain records a DB confirmation, but cannot inspect DB rows itself.
contract LedgerCreditTest is ProtocolFixture {
    event LedgerCreditConfirmed(bytes32 indexed refundKey);

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        torna.registerIssuer(issuers[0], request().acquirerHash, "HYBRID");
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        vm.stopPrank();
        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }

        CollateralDepositRequest memory collateral = CollateralDepositRequest({
            issuer: issuers[0], amount: 3_000e6, nonce: 0, deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, torna.hashCollateralDeposit(collateral));
        vm.startPrank(issuers[0]);
        token.approve(address(torna), type(uint256).max);
        vm.stopPrank();
        vm.prank(submitter);
        torna.depositCollateral(collateral, abi.encodePacked(r, s, v));

        AdvanceRequest memory advance = request();
        bytes memory signature = sign(advance);
        vm.prank(submitter);
        assertTrue(torna.advance(advance, signature));
    }

    function testOnlySubmitterCanConfirmExistingRefundOnceWithoutAccountingChanges() public {
        bytes32 key = request().refundKey;
        uint256 balanceBefore = token.balanceOf(address(torna));
        uint256 principalBefore = torna.totalLpPrincipal();
        uint256 feesBefore = torna.totalLpFees();
        uint256 reserveBefore = torna.reserveBalance();
        uint256 protocolBefore = torna.protocolFees();
        uint256 collateralBefore = torna.totalCollateral();
        uint256 lossBefore = torna.totalLoss();
        uint256 navBefore = torna.netAssetValue();
        uint256 outstandingBefore = torna.totalOutstanding();
        uint256 advanceCountBefore = torna.totalAdvanceCount();
        uint256 nonceBefore = torna.advanceNonces(issuers[0]);

        vm.expectRevert();
        vm.prank(admin);
        torna.confirmLedgerCredit(key);

        vm.expectEmit(true, false, false, false, address(torna));
        emit LedgerCreditConfirmed(key);
        vm.prank(submitter);
        torna.confirmLedgerCredit(key);

        assertEq(token.balanceOf(address(torna)), balanceBefore, "confirmation moves no tokens");
        assertEq(torna.totalLpPrincipal(), principalBefore, "principal unchanged");
        assertEq(torna.totalLpFees(), feesBefore, "fees unchanged");
        assertEq(torna.reserveBalance(), reserveBefore, "reserve unchanged");
        assertEq(torna.protocolFees(), protocolBefore, "protocol fees unchanged");
        assertEq(torna.totalCollateral(), collateralBefore, "collateral unchanged");
        assertEq(torna.totalLoss(), lossBefore, "loss unchanged");
        assertEq(torna.netAssetValue(), navBefore, "NAV unchanged");
        assertEq(torna.totalOutstanding(), outstandingBefore, "outstanding unchanged");
        assertEq(torna.totalAdvanceCount(), advanceCountBefore, "count unchanged");
        assertEq(torna.advanceNonces(issuers[0]), nonceBefore, "nonce unchanged");
        assertEq(uint8(torna.positionOf(key).state), uint8(PositionState.Advanced));

        vm.expectRevert(Torna.LedgerCreditAlreadyConfirmed.selector);
        vm.prank(submitter);
        torna.confirmLedgerCredit(key);
    }

    function testUnknownRefundCannotBeAcknowledged() public {
        bytes32 unknown = keccak256("never-issued");
        vm.expectRevert(abi.encodeWithSelector(Torna.UnknownPosition.selector, unknown));
        vm.prank(submitter);
        torna.confirmLedgerCredit(unknown);
    }

    function testRepaidT0PositionCanBeAcknowledgedOnRetry() public {
        AdvanceRequest memory advance = request();
        RepaymentRequest memory repayment = RepaymentRequest({
            refundKey: advance.refundKey,
            issuer: issuers[0],
            amount: advance.amount,
            nonce: 0,
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, torna.hashRepaymentRequest(repayment));
        vm.prank(submitter);
        torna.repay(repayment, abi.encodePacked(r, s, v));
        assertEq(uint8(torna.positionOf(advance.refundKey).state), uint8(PositionState.Repaid));

        uint256 balanceBefore = token.balanceOf(address(torna));
        vm.prank(submitter);
        torna.confirmLedgerCredit(advance.refundKey);
        assertEq(token.balanceOf(address(torna)), balanceBefore);
        assertEq(uint8(torna.positionOf(advance.refundKey).state), uint8(PositionState.Repaid));
    }
}
