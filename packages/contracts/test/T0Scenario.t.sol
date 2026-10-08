// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Torna } from "../src/Torna.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import {
    AdvanceRequest,
    CollateralDepositRequest,
    PermitSignature,
    Position,
    PositionState,
    RepaymentRequest
} from "../src/TornaTypes.sol";

/// @notice End-to-end local-EVM proof for the PRD's t0 normal path.
/// @dev These are test-only identities; no external node, wallet or credential is used.
contract T0ScenarioTest is Test {
    uint256 internal constant USDC = 1e6;
    uint256 internal constant THIRTY_DAYS = 30 days;
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    Torna internal torna;
    MockUSDC internal token;
    address internal deployer;
    address internal verifier;
    address internal submitter;
    address internal hybrid;
    address internal aura;
    address internal lp01;
    address internal lp02;
    address internal lp03;
    uint256 internal hybridKey;
    uint256 internal auraKey;
    bytes32 internal hybridAcquirer;

    event AdvanceIssued(
        bytes32 indexed refundKey, address indexed issuer, uint256 amount, uint64 maturity
    );
    event AdvanceRejected(bytes32 indexed refundKey, uint8 reason);
    event AdvanceRepaid(bytes32 indexed refundKey, uint256 amount);

    function setUp() public {
        vm.chainId(31337);
        deployer = makeAddr("t0-deployer");
        verifier = makeAddr("t0-verifier");
        submitter = makeAddr("t0-submitter");
        (hybrid, hybridKey) = makeAddrAndKey("t0-hybrid");
        (aura, auraKey) = makeAddrAndKey("t0-aura");
        lp01 = makeAddr("t0-lp-01");
        lp02 = makeAddr("t0-lp-02");
        lp03 = makeAddr("t0-lp-03");
        hybridAcquirer = keccak256(bytes(unicode"ACQ-α"));

        token = new MockUSDC(deployer);
        torna = new Torna(token, deployer, verifier, submitter);
    }

    function testT0NormalPathMovesTokensChecksReceiptsAndBlocksReplay() public {
        _mintT0Balances();
        _fundInitialLiquidity();
        _registerAndMatureIssuers();
        _depositT0Collateral();
        _seedReserve();

        AdvanceRequest memory advanceRequest = _advanceRequest();
        bytes memory advanceSignature = _signAdvance(advanceRequest);
        (uint256 fee,,,) = torna.quoteAdvanceFee(advanceRequest.amount);
        PermitSignature memory advancePermit = _permitFor(hybrid, hybridKey, fee);
        vm.deal(hybrid, 0);
        vm.expectEmit(true, true, false, true, address(torna));
        emit AdvanceIssued(
            advanceRequest.refundKey,
            advanceRequest.issuer,
            advanceRequest.amount,
            advanceRequest.maturity
        );
        vm.prank(submitter);
        assertTrue(torna.advanceWithPermit(advanceRequest, advanceSignature, advancePermit));

        RepaymentRequest memory repaymentRequest = RepaymentRequest({
            refundKey: advanceRequest.refundKey,
            issuer: hybrid,
            amount: advanceRequest.amount,
            nonce: torna.repaymentNonces(hybrid),
            deadline: block.timestamp + 10 minutes
        });
        bytes memory repaymentSignature = _signRepayment(repaymentRequest);
        PermitSignature memory repaymentPermit =
            _permitFor(hybrid, hybridKey, repaymentRequest.amount);
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRepaid(repaymentRequest.refundKey, repaymentRequest.amount);
        vm.prank(submitter);
        torna.repayWithPermit(repaymentRequest, repaymentSignature, repaymentPermit);

        _assertT0FinalState(advanceRequest);
        _assertReplayIsBlocked(
            advanceRequest, advanceSignature, repaymentRequest, repaymentSignature
        );
    }

    function _mintT0Balances() private {
        vm.startPrank(deployer);
        token.mint(deployer, 500 * USDC);
        token.mint(lp01, 5000 * USDC);
        token.mint(lp02, 3000 * USDC);
        token.mint(lp03, 2000 * USDC);
        token.mint(hybrid, 4003 * USDC);
        token.mint(aura, 600 * USDC);
        vm.stopPrank();
    }

    function _fundInitialLiquidity() private {
        vm.prank(deployer);
        torna.configureInitialLiquidity([lp01, lp02, lp03]);
        _depositInitialLiquidity(lp01, 5000 * USDC);
        _depositInitialLiquidity(lp02, 3000 * USDC);
        _depositInitialLiquidity(lp03, 2000 * USDC);
        assertTrue(torna.initialLiquidityComplete());
        assertEq(torna.totalLpPrincipal(), 10_000 * USDC);
    }

    function _depositInitialLiquidity(address lp, uint256 amount) private {
        vm.startPrank(lp);
        token.approve(address(torna), amount);
        torna.depositInitialLiquidity(amount);
        vm.stopPrank();
    }

    function _registerAndMatureIssuers() private {
        vm.startPrank(deployer);
        torna.registerIssuer(hybrid, hybridAcquirer, "HYBRID Travel Card");
        torna.registerIssuer(aura, keccak256(bytes(unicode"ACQ-β")), "AURA Travel Card");
        vm.stopPrank();
        vm.warp(block.timestamp + THIRTY_DAYS);
        assertFalse(torna.isIssuerRamping(hybrid));
        assertFalse(torna.isIssuerRamping(aura));
    }

    function _depositT0Collateral() private {
        _depositCollateralWithPermit(hybrid, hybridKey, 3000 * USDC);
        _depositCollateralWithPermit(aura, auraKey, 600 * USDC);
        assertEq(torna.collateralOf(hybrid), 3000 * USDC);
        assertEq(torna.collateralOf(aura), 600 * USDC);
    }

    function _depositCollateralWithPermit(address issuer, uint256 issuerKey, uint256 amount)
        private
    {
        uint256 deadline = block.timestamp + 10 minutes;
        CollateralDepositRequest memory request = CollateralDepositRequest({
            issuer: issuer,
            amount: amount,
            nonce: torna.collateralDepositNonces(issuer),
            deadline: deadline
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey, torna.hashCollateralDeposit(request));
        PermitSignature memory permitSignature = _permitFor(issuer, issuerKey, amount);
        vm.prank(submitter);
        torna.depositCollateralWithPermit(request, abi.encodePacked(r, s, v), permitSignature);
    }

    function _seedReserve() private {
        vm.startPrank(deployer);
        token.approve(address(torna), 500 * USDC);
        torna.seedReserve(500 * USDC);
        vm.stopPrank();
        assertEq(torna.reserveBalance(), 500 * USDC);
    }

    function _advanceRequest() private view returns (AdvanceRequest memory) {
        return AdvanceRequest({
            refundKey: keccak256(bytes("REF-2026-001")),
            issuer: hybrid,
            acquirerHash: hybridAcquirer,
            amount: 1000 * USDC,
            maturity: SafeCast.toUint64(block.timestamp + 5 days),
            nonce: torna.advanceNonces(hybrid),
            deadline: block.timestamp + 10 minutes
        });
    }

    function _signAdvance(AdvanceRequest memory request) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(hybridKey, torna.hashAdvanceRequest(request));
        return abi.encodePacked(r, s, v);
    }

    function _signRepayment(RepaymentRequest memory request) private view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(hybridKey, torna.hashRepaymentRequest(request));
        return abi.encodePacked(r, s, v);
    }

    function _permitFor(address owner, uint256 ownerKey, uint256 value)
        private
        view
        returns (PermitSignature memory permitSignature)
    {
        permitSignature.deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                owner,
                address(torna),
                value,
                token.nonces(owner),
                permitSignature.deadline
            )
        );
        (permitSignature.v, permitSignature.r, permitSignature.s) = vm.sign(
            ownerKey, keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), structHash))
        );
    }

    function _assertT0FinalState(AdvanceRequest memory request) private view {
        Position memory position = torna.positionOf(request.refundKey);
        assertEq(uint8(position.state), uint8(PositionState.Repaid));
        assertEq(torna.totalLpPrincipal(), 10_000 * USDC);
        assertEq(torna.totalLpFees(), 2_400_000);
        assertEq(torna.reserveBalance(), 500_399_000);
        assertEq(torna.protocolFees(), 201_000);
        assertEq(torna.totalCollateral(), 3600 * USDC);
        assertEq(torna.totalOutstanding(), 0);
        assertEq(torna.issuerOutstanding(hybrid), 0);
        assertEq(torna.acquirerOutstanding(hybridAcquirer), 0);
        assertEq(torna.totalAdvanceCount(), 1);
        assertEq(torna.totalAdvanced(), 1000 * USDC);
        assertEq(torna.advanceNonces(hybrid), 1);
        assertEq(torna.repaymentNonces(hybrid), 1);
        assertEq(token.balanceOf(hybrid), 1000 * USDC);
        assertEq(token.balanceOf(aura), 0);
        assertEq(token.balanceOf(address(torna)), 14_103 * USDC);
        assertEq(
            token.balanceOf(address(torna)),
            torna.poolCash() + torna.totalCollateral() + torna.reserveBalance()
                + torna.protocolFees()
        );
    }

    function _assertReplayIsBlocked(
        AdvanceRequest memory advanceRequest,
        bytes memory advanceSignature,
        RepaymentRequest memory repaymentRequest,
        bytes memory repaymentSignature
    ) private {
        uint256 poolBalance = token.balanceOf(address(torna));
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRejected(advanceRequest.refundKey, 1);
        vm.prank(submitter);
        assertFalse(torna.advance(advanceRequest, advanceSignature));
        assertEq(torna.totalAdvanceCount(), 1);
        assertEq(token.balanceOf(address(torna)), poolBalance);

        vm.prank(submitter);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InvalidRepaymentState.selector,
                repaymentRequest.refundKey,
                PositionState.Repaid
            )
        );
        torna.repay(repaymentRequest, repaymentSignature);
        assertEq(torna.repaymentNonces(hybrid), 1);
        assertEq(token.balanceOf(address(torna)), poolBalance);
    }
}
