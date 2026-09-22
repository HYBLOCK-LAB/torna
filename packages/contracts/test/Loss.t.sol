// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import {
    AdvanceRequest,
    CollateralDepositRequest,
    PositionState,
    RepaymentRequest
} from "../src/TornaTypes.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract LossTest is ProtocolFixture {
    bytes32 internal constant ACQUIRER_A = keccak256(bytes(unicode"ACQ-α"));
    bytes32 internal constant ACQUIRER_B = keccak256(bytes(unicode"ACQ-β"));

    event AdvanceRepaid(bytes32 indexed refundKey, uint256 amount);
    event CoveredLossFinalized(bytes32 indexed refundKey, uint256 coverage);
    event LossCapTriggered(bytes32 indexed acquirerHash, uint256 cap);
    event RecoveryRecorded(bytes32 indexed refundKey, uint256 recovered);

    function setUp() public override {
        super.setUp();
        vm.startPrank(admin);
        torna.registerIssuer(issuers[0], ACQUIRER_A, "HYBRID");
        torna.registerIssuer(issuers[1], ACQUIRER_B, "AURA");
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }

        _depositCollateral(0, 3000e6);
        _depositCollateral(1, 600e6);
        vm.prank(issuers[0]);
        token.approve(address(torna), type(uint256).max);
        vm.prank(issuers[1]);
        token.approve(address(torna), type(uint256).max);
        vm.warp(block.timestamp + 30 days);
    }

    function testT3AndT3bStatefulLossRecoveryAccounting() public {
        AdvanceRequest memory prior = _request(0, ACQUIRER_A, 100, "prior");
        _issue(prior, 0);

        AdvanceRequest memory first = _request(1, ACQUIRER_B, 200, "aura-1");
        _issue(first, 1);
        AdvanceRequest memory second = _request(1, ACQUIRER_B, 201, "aura-2");
        _issue(second, 1);
        AdvanceRequest memory third = _request(1, ACQUIRER_B, 202, "aura-3");
        _issue(third, 1);
        AdvanceRequest memory fourth = _request(1, ACQUIRER_B, 203, "aura-4");
        _issue(fourth, 1);

        vm.warp(block.timestamp + 2);
        _reviewAndFinalize(prior);
        _reviewAndFinalize(first);
        _reviewAndFinalize(second);
        _reviewAndFinalize(third);
        _reviewAndFinalize(fourth);

        assertEq(torna.eventRecognizedCoverage(ACQUIRER_B), 1600e6);
        assertEq(torna.collateralOf(issuers[1]), 200e6);
        assertEq(torna.reserveBalance(), 0);
        assertEq(torna.totalOutstanding(), 2000e6);
        assertEq(uint8(torna.positionOf(first.refundKey).state), uint8(PositionState.CoveredLoss));
        assertEq(uint8(torna.positionOf(second.refundKey).state), uint8(PositionState.CoveredLoss));
        assertEq(uint8(torna.positionOf(third.refundKey).state), uint8(PositionState.CapHeld));
        assertEq(uint8(torna.positionOf(fourth.refundKey).state), uint8(PositionState.CapHeld));

        uint256 lpLossBeforeRecovery = torna.totalLpLoss();
        vm.prank(admin);
        token.mint(verifier, 2200e6);
        vm.prank(verifier);
        token.approve(address(torna), 2200e6);
        vm.expectEmit(true, false, false, true, address(torna));
        emit RecoveryRecorded(first.refundKey, 2200e6);
        vm.prank(verifier);
        torna.recordRecovery(first.refundKey, 2200e6);

        assertEq(torna.totalLpLoss(), lpLossBeforeRecovery - 400e6);
        assertEq(torna.collateralOf(issuers[1]), 0);
        assertEq(torna.totalCollateral(), 2800e6);
        assertEq(torna.eventRecognizedCoverage(ACQUIRER_B), 0);
        assertEq(torna.totalOutstanding(), 0);
        assertEq(torna.acquirerOutstanding(ACQUIRER_B), 0);
        assertEq(
            uint8(torna.positionOf(first.refundKey).state), uint8(PositionState.RecoveryRecorded)
        );
        assertEq(
            uint8(torna.positionOf(second.refundKey).state), uint8(PositionState.RecoveryRecorded)
        );
        assertEq(
            uint8(torna.positionOf(third.refundKey).state), uint8(PositionState.RecoveryRecorded)
        );
        assertEq(
            uint8(torna.positionOf(fourth.refundKey).state), uint8(PositionState.RecoveryRecorded)
        );
        _assertBacking();
    }

    function testReviewCanRepayBeforeLossFinalization() public {
        AdvanceRequest memory req = _request(0, ACQUIRER_A, 300, "late-repay");
        _issue(req, 0);
        vm.warp(block.timestamp + 2);
        vm.prank(verifier);
        torna.openReview(req.refundKey, "late but settled");

        RepaymentRequest memory repayment = RepaymentRequest({
            refundKey: req.refundKey,
            issuer: req.issuer,
            amount: req.amount,
            nonce: torna.repaymentNonces(req.issuer),
            deadline: block.timestamp + 10 minutes
        });
        uint256 key = _issuerKey(0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, torna.hashRepaymentRequest(repayment));
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRepaid(req.refundKey, req.amount);
        vm.prank(submitter);
        torna.repay(repayment, abi.encodePacked(r, s, v));

        assertEq(uint8(torna.positionOf(req.refundKey).state), uint8(PositionState.Repaid));
        assertEq(torna.totalOutstanding(), 0);
    }

    function testReviewCannotOpenBeforeMaturity() public {
        AdvanceRequest memory req = _request(0, ACQUIRER_A, 301, "too-early");
        _issue(req, 0);

        vm.prank(verifier);
        vm.expectRevert();
        torna.openReview(req.refundKey, "premature evidence");
        assertEq(uint8(torna.positionOf(req.refundKey).state), uint8(PositionState.Advanced));
    }

    function testRecoveryNeedsAllowanceAndRejectsOverRecoveryAtomically() public {
        AdvanceRequest memory req = _request(0, ACQUIRER_A, 302, "recovery-guards");
        _issue(req, 0);
        vm.warp(block.timestamp + 2);
        _reviewAndFinalize(req);
        uint256 lpLoss = torna.totalLpLoss();

        vm.prank(verifier);
        vm.expectRevert();
        torna.recordRecovery(req.refundKey, 1);
        assertEq(torna.totalLpLoss(), lpLoss);
        assertEq(uint8(torna.positionOf(req.refundKey).state), uint8(PositionState.CoveredLoss));

        vm.prank(admin);
        token.mint(verifier, req.amount + 1);
        vm.prank(verifier);
        token.approve(address(torna), req.amount + 1);
        vm.prank(verifier);
        vm.expectRevert();
        torna.recordRecovery(req.refundKey, req.amount + 1);
        assertEq(torna.totalLpLoss(), lpLoss);
        assertEq(uint8(torna.positionOf(req.refundKey).state), uint8(PositionState.CoveredLoss));
    }

    function testRecoveryCannotBeRecordedTwice() public {
        AdvanceRequest memory req = _request(0, ACQUIRER_A, 303, "recovery-once");
        _issue(req, 0);
        vm.warp(block.timestamp + 2);
        _reviewAndFinalize(req);

        vm.prank(verifier);
        torna.recordRecovery(req.refundKey, 0);
        vm.prank(verifier);
        vm.expectRevert();
        torna.recordRecovery(req.refundKey, 0);
    }

    function testSameAcquirerCanStartANewEventAfterRecovery() public {
        AdvanceRequest memory first = _request(0, ACQUIRER_A, 304, "event-one");
        _issue(first, 0);
        vm.warp(block.timestamp + 2);
        _reviewAndFinalize(first);
        vm.prank(verifier);
        torna.recordRecovery(first.refundKey, 0);

        AdvanceRequest memory second = _request(0, ACQUIRER_A, 305, "event-two");
        _issue(second, 0);
        vm.warp(block.timestamp + 2);
        _reviewAndFinalize(second);
        assertEq(uint8(torna.positionOf(second.refundKey).state), uint8(PositionState.CoveredLoss));
    }

    function testOnlyVerifierCanOpenReviewFinalizeAndRecordRecovery() public {
        AdvanceRequest memory req = _request(0, ACQUIRER_A, 400, "role-check");
        _issue(req, 0);
        vm.warp(block.timestamp + 2);

        vm.prank(submitter);
        vm.expectRevert();
        torna.openReview(req.refundKey, "not verifier");

        vm.prank(verifier);
        torna.openReview(req.refundKey, "evidence");

        vm.prank(submitter);
        vm.expectRevert();
        torna.finalizeCoveredLoss(req.refundKey);

        vm.prank(verifier);
        torna.finalizeCoveredLoss(req.refundKey);

        vm.prank(submitter);
        vm.expectRevert();
        torna.recordRecovery(req.refundKey, 0);
    }

    function _depositCollateral(uint256 index, uint256 amount) private {
        address issuer = issuers[index];
        uint256 key = _issuerKey(index);
        CollateralDepositRequest memory request = CollateralDepositRequest({
            issuer: issuer,
            amount: amount,
            nonce: torna.collateralDepositNonces(issuer),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, torna.hashCollateralDeposit(request));
        vm.prank(issuer);
        token.approve(address(torna), amount);
        vm.prank(submitter);
        torna.depositCollateral(request, abi.encodePacked(r, s, v));
    }

    function _issue(AdvanceRequest memory request, uint256 index) private {
        uint256 key = _issuerKey(index);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, torna.hashAdvanceRequest(request));
        vm.prank(submitter);
        assertTrue(torna.advance(request, abi.encodePacked(r, s, v)));
    }

    function _reviewAndFinalize(AdvanceRequest memory request) private {
        vm.prank(verifier);
        torna.openReview(request.refundKey, "settlement not received");
        vm.prank(verifier);
        torna.finalizeCoveredLoss(request.refundKey);
    }

    function _request(uint256 issuerIndex, bytes32 acquirerHash, uint256 salt, string memory label)
        private
        view
        returns (AdvanceRequest memory request)
    {
        request = AdvanceRequest({
            refundKey: keccak256(abi.encode(label, salt)),
            issuer: issuers[issuerIndex],
            acquirerHash: acquirerHash,
            amount: 1000e6,
            maturity: SafeCast.toUint64(block.timestamp + 1),
            nonce: torna.advanceNonces(issuers[issuerIndex]),
            deadline: block.timestamp + 10 minutes
        });
    }

    function _issuerKey(uint256 index) private returns (uint256 key) {
        (, key) = makeAddrAndKey(string.concat("test-issuer-", vm.toString(index)));
    }

    function _assertBacking() private view {
        assertEq(
            token.balanceOf(address(torna)),
            torna.poolCash() + torna.totalCollateral() + torna.reserveBalance()
                + torna.protocolFees()
        );
        assertEq(torna.poolCash() + torna.totalOutstanding(), torna.poolCapacity());
    }
}
