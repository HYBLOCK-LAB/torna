// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ProtocolFixture } from "./ProtocolFixture.sol";
import {
    AdvanceRequest,
    CollateralDepositRequest,
    PositionState,
    RepaymentRequest
} from "../src/TornaTypes.sol";

/// @notice Continuous accounting proof for the implemented t0 through t5 path.
/// @dev This deliberately uses one deployed contract and never resets state between timepoints.
contract ScenarioAccountingTest is ProtocolFixture {
    uint256 internal constant USDC = 1e6;
    bytes32 internal constant ACQUIRER_A = keccak256(bytes(unicode"ACQ-α"));
    bytes32 internal constant ACQUIRER_B = keccak256(bytes(unicode"ACQ-β"));

    function setUp() public override {
        super.setUp();

        vm.startPrank(admin);
        token.mint(admin, 500 * USDC);
        torna.registerIssuer(issuers[0], ACQUIRER_A, "HYBRID Travel Card");
        torna.registerIssuer(issuers[1], ACQUIRER_B, "AURA Travel Card");
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        vm.stopPrank();

        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }

        _depositCollateral(0, 3_000 * USDC);
        _depositCollateral(1, 600 * USDC);
        vm.prank(issuers[0]);
        token.approve(address(torna), type(uint256).max);
        vm.prank(issuers[1]);
        token.approve(address(torna), type(uint256).max);

        vm.startPrank(admin);
        token.approve(address(torna), 500 * USDC);
        torna.seedReserve(500 * USDC);
        vm.stopPrank();
        vm.warp(block.timestamp + 30 days);
    }

    function testContinuousT0ThroughT5MatchesProjectAccounting() public {
        _runT0();
        bytes32 yearlyLoss = _runT1();
        _runT2(yearlyLoss);
        bytes32 auraEventAnchor = _runT3();
        _runT3b(auraEventAnchor);
        bytes32[4] memory withdrawalAdvances = _runT4();
        _runT4b(withdrawalAdvances);
        _runT5();
    }

    function _runT0() private {
        bytes32 refundKey = keccak256(bytes("REF-2026-001"));
        _issue(0, ACQUIRER_A, refundKey);
        _repay(0, refundKey);

        assertEq(torna.totalLpPrincipal(), 10_000 * USDC, "t0 principal");
        assertEq(torna.totalLpFees(), 2_400_000, "t0 LP fee");
        assertEq(torna.totalOutstanding(), 0, "t0 outstanding");
        assertEq(torna.poolCapacity(), 10_002_400_000, "t0 NAV");
        assertEq(torna.totalAdvanceCount(), 1, "t0 count");
    }

    function _runT1() private returns (bytes32 yearlyLoss) {
        for (uint256 i; i < 365; ++i) {
            bytes32 refundKey = _key("t1", i);
            _issue(0, ACQUIRER_A, refundKey);
            if (i < 364) {
                _repay(0, refundKey);
            } else {
                yearlyLoss = refundKey;
            }
        }
        vm.warp(block.timestamp + 2);
        vm.prank(verifier);
        torna.openReview(yearlyLoss, "Upstream settlement agent non-receipt confirmation");

        assertEq(torna.totalLpFees(), 878_400_000, "t1 LP fee");
        assertEq(torna.reserveBalance(), 646_034_000, "t1 reserve");
        assertEq(torna.totalOutstanding(), 1_000 * USDC, "t1 outstanding");
        assertEq(torna.poolCapacity(), 10_878_400_000, "t1 NAV");
        assertEq(torna.totalAdvanceCount(), 366, "t1 count");
    }

    function _runT2(bytes32 yearlyLoss) private {
        vm.prank(verifier);
        torna.finalizeCoveredLoss(yearlyLoss);

        assertEq(torna.collateralOf(issuers[0]), 2_800 * USDC, "t2 collateral");
        assertEq(torna.reserveBalance(), 0, "t2 reserve");
        assertEq(torna.totalLpLoss(), 153_966_000, "t2 LP loss");
        assertEq(torna.totalLoss(), 1_000 * USDC, "t2 total loss");
        assertEq(torna.totalOutstanding(), 0, "t2 outstanding");
        assertEq(torna.poolCapacity(), 10_724_434_000, "t2 NAV");
    }

    function _runT3() private returns (bytes32 eventAnchor) {
        bytes32[4] memory keys;
        for (uint256 i; i < keys.length; ++i) {
            keys[i] = _key("t3", i);
            _issue(1, ACQUIRER_B, keys[i]);
        }
        vm.warp(block.timestamp + 2);
        for (uint256 i; i < keys.length; ++i) {
            vm.prank(verifier);
            torna.openReview(keys[i], "Acquirer beta stopped settling");
            vm.prank(verifier);
            torna.finalizeCoveredLoss(keys[i]);
        }

        assertEq(torna.eventRecognizedCoverage(ACQUIRER_B), 1_600 * USDC, "t3 cap");
        assertEq(torna.totalLpFees(), 888 * USDC, "t3 LP fee");
        assertEq(torna.totalLpLoss(), 1_752_370_000, "t3 LP loss");
        assertEq(torna.totalLoss(), 3_000 * USDC, "t3 total loss");
        assertEq(torna.totalOutstanding(), 2_000 * USDC, "t3 outstanding");
        assertEq(torna.poolCapacity(), 9_135_630_000, "t3 NAV");
        assertEq(uint8(torna.positionOf(keys[2]).state), uint8(PositionState.CapHeld));
        assertEq(uint8(torna.positionOf(keys[3]).state), uint8(PositionState.CapHeld));
        return keys[0];
    }

    function _runT3b(bytes32 eventAnchor) private {
        vm.prank(admin);
        token.mint(verifier, 2_200 * USDC);
        vm.prank(verifier);
        token.approve(address(torna), 2_200 * USDC);
        vm.prank(verifier);
        torna.recordRecovery(eventAnchor, 2_200 * USDC);

        assertEq(torna.collateralOf(issuers[1]), 0, "t3b AURA collateral");
        assertEq(torna.totalLpLoss(), 1_352_370_000, "t3b LP loss");
        assertEq(torna.totalLoss(), 2_800 * USDC, "t3b total loss");
        assertEq(torna.totalOutstanding(), 0, "t3b outstanding");
        assertEq(torna.poolCapacity(), 9_535_630_000, "t3b NAV");
    }

    function _runT4() private returns (bytes32[4] memory keys) {
        for (uint256 i; i < keys.length; ++i) {
            keys[i] = _key("t4", i);
            _issue(0, ACQUIRER_A, keys[i]);
        }

        vm.prank(lps[2]);
        (uint256 immediate, uint256 pending) = torna.requestWithdraw(2_000 * USDC);

        assertEq(immediate, 1_109_046_000, "t4 immediate quote");
        assertEq(pending, 800 * USDC, "t4 pending quote");
        assertEq(torna.totalLpPrincipal(), 10_000 * USDC, "t4 principal");
        assertEq(torna.lpPrincipal(lps[2]), 2_000 * USDC, "t4 LP-03 principal");
        assertEq(torna.totalOutstanding(), 4_000 * USDC, "t4 outstanding");
        assertEq(torna.poolCapacity(), 9_545_230_000, "t4 NAV before payment");
        assertEq(torna.poolCash(), 5_545_230_000, "t4 cash before payment");
    }

    function _runT4b(bytes32[4] memory keys) private {
        torna.processWithdrawal();
        for (uint256 i; i < 3; ++i) {
            _repay(0, keys[i]);
        }

        assertEq(torna.totalLpPrincipal(), 8_000 * USDC, "t4b principal");
        assertEq(torna.lpPrincipal(lps[2]), 0, "t4b LP-03 exit");
        assertEq(torna.totalLpFees(), 718_080_000, "t4b LP fee");
        assertEq(torna.totalLpLoss(), 1_081_896_000, "t4b LP loss");
        assertEq(torna.totalLoss(), 2_529_526_000, "t4b total loss");
        assertEq(torna.totalOutstanding(), 1_000 * USDC, "t4b outstanding");
        assertEq(torna.poolCapacity(), 7_636_184_000, "t4b NAV");
    }

    function _runT5() private {
        bytes32 delayed = _key("t5", 0);
        _issue(0, ACQUIRER_A, delayed);
        vm.warp(block.timestamp + 2);
        vm.prank(verifier);
        torna.openReview(delayed, "Delayed upstream settlement");
        _repay(0, delayed);

        assertEq(torna.totalLpFees(), 720_480_000, "t5 LP fee");
        assertEq(torna.reserveBalance(), 1_995_000, "t5 reserve");
        assertEq(torna.totalOutstanding(), 1_000 * USDC, "t5 outstanding");
        assertEq(torna.poolCapacity(), 7_638_584_000, "t5 NAV");
        assertEq(torna.totalAdvanceCount(), 375, "t5 count");
        assertEq(torna.totalAdvanced(), 375_000 * USDC, "t5 advanced");
    }

    function _depositCollateral(uint256 issuerIndex, uint256 amount) private {
        address issuer = issuers[issuerIndex];
        CollateralDepositRequest memory request_ = CollateralDepositRequest({
            issuer: issuer,
            amount: amount,
            nonce: torna.collateralDepositNonces(issuer),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(_issuerKey(issuerIndex), torna.hashCollateralDeposit(request_));
        vm.prank(issuer);
        token.approve(address(torna), amount);
        vm.prank(submitter);
        torna.depositCollateral(request_, abi.encodePacked(r, s, v));
    }

    function _issue(uint256 issuerIndex, bytes32 acquirerHash, bytes32 refundKey) private {
        address issuer = issuers[issuerIndex];
        AdvanceRequest memory request_ = AdvanceRequest({
            refundKey: refundKey,
            issuer: issuer,
            acquirerHash: acquirerHash,
            amount: 1_000 * USDC,
            maturity: SafeCast.toUint64(block.timestamp + 1),
            nonce: torna.advanceNonces(issuer),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(_issuerKey(issuerIndex), torna.hashAdvanceRequest(request_));
        vm.prank(submitter);
        assertTrue(torna.advance(request_, abi.encodePacked(r, s, v)));
    }

    function _repay(uint256 issuerIndex, bytes32 refundKey) private {
        address issuer = issuers[issuerIndex];
        RepaymentRequest memory request_ = RepaymentRequest({
            refundKey: refundKey,
            issuer: issuer,
            amount: 1_000 * USDC,
            nonce: torna.repaymentNonces(issuer),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(_issuerKey(issuerIndex), torna.hashRepaymentRequest(request_));
        vm.prank(submitter);
        torna.repay(request_, abi.encodePacked(r, s, v));
    }

    function _issuerKey(uint256 issuerIndex) private returns (uint256 key) {
        (, key) = makeAddrAndKey(string.concat("test-issuer-", vm.toString(issuerIndex)));
    }

    function _key(string memory scope, uint256 index) private pure returns (bytes32) {
        return keccak256(abi.encode(scope, index));
    }
}
