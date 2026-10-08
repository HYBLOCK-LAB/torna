// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import {
    AdvanceRequest,
    CollateralDepositRequest,
    PermitSignature,
    Position,
    PositionState,
    IssuerState
} from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @dev Adversarial token ONLY used in tests. The production mock has none of these controls.
contract AdvanceTestToken is MockUSDC {
    uint8 public mode;
    bytes public callback;
    bool public callbackBlocked;

    constructor(address admin) MockUSDC(admin) { }

    function configure(uint8 mode_, bytes memory callback_) external {
        mode = mode_;
        callback = callback_;
    }

    function destroy(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function tryCallback(address target) private {
        (bool success, bytes memory result) = target.call(callback);
        // Only an error selector is extracted, not a numeric narrowing conversion.
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes4 errorSelector = bytes4(result);
        callbackBlocked =
            !success && errorSelector == ReentrancyGuard.ReentrancyGuardReentrantCall.selector;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (mode == 1) return false;
        if (mode == 2) _burn(to, 1);
        if (mode == 5) tryCallback(to);
        return true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        if (mode == 3) return false;
        if (mode == 4) _burn(to, 1);
        if (mode == 6) tryCallback(msg.sender);
        return true;
    }
}

contract AdvanceTest is ProtocolFixture {
    AdvanceTestToken internal testToken;
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    event AdvanceIssued(
        bytes32 indexed refundKey, address indexed issuer, uint256 amount, uint64 maturity
    );
    event AdvanceRejected(bytes32 indexed refundKey, uint8 reason);

    function setUp() public override {
        super.setUp();
        testToken = new AdvanceTestToken(admin);
        token = testToken;
        torna = new Torna(token, admin, verifier, submitter);
        vm.startPrank(admin);
        for (uint256 i; i < 3; ++i) {
            token.mint(lps[i], 20_000e6);
        }
        for (uint256 i; i < 2; ++i) {
            token.mint(issuers[i], 10_000e6);
        }
        torna.registerIssuer(issuers[0], request().acquirerHash, "HYBRID");
        torna.registerIssuer(issuers[1], keccak256("ACQ-B"), "AURA");
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        vm.stopPrank();
        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }
        fundCollateral(0, 3000e6);
        fundCollateral(1, 600e6);
        vm.warp(block.timestamp + 30 days);
    }

    function issuerKey(uint256 index) internal returns (uint256 key) {
        (, key) = makeAddrAndKey(string.concat("test-issuer-", vm.toString(index)));
    }

    function fundCollateral(uint256 index, uint256 amount) internal {
        address issuer = issuers[index];
        CollateralDepositRequest memory req = CollateralDepositRequest(
            issuer, amount, torna.collateralDepositNonces(issuer), block.timestamp + 10 minutes
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(issuerKey(index), torna.hashCollateralDeposit(req));
        vm.prank(issuer);
        token.approve(address(torna), amount);
        vm.prank(submitter);
        torna.depositCollateral(req, abi.encodePacked(r, s, v));
    }

    function permitFor(uint256 index, uint256 fee) internal returns (PermitSignature memory p) {
        p.deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                issuers[index],
                address(torna),
                fee,
                token.nonces(issuers[index]),
                p.deadline
            )
        );
        (p.v, p.r, p.s) = vm.sign(
            issuerKey(index),
            keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), structHash))
        );
    }

    function submit(AdvanceRequest memory req, bytes memory sig) internal returns (bool) {
        vm.prank(submitter);
        return torna.advance(req, sig);
    }

    function submitWithPermit(AdvanceRequest memory req, bytes memory sig, PermitSignature memory p)
        internal
        returns (bool)
    {
        vm.prank(submitter);
        return torna.advanceWithPermit(req, sig, p);
    }

    function issue(AdvanceRequest memory req, uint256 index) internal {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(index), torna.hashAdvanceRequest(req));
        (uint256 fee,,,) = torna.quoteAdvanceFee(req.amount);
        assertTrue(submitWithPermit(req, abi.encodePacked(r, s, v), permitFor(index, fee)));
    }

    function expectRejection(AdvanceRequest memory req, bytes memory sig, uint8 reason) internal {
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRejected(req.refundKey, reason);
        assertFalse(submit(req, sig));
    }

    function assertUnchanged() internal view {
        assertEq(torna.advanceNonces(issuers[0]), 0);
        assertEq(torna.totalAdvanceCount(), 0);
        assertEq(torna.totalAdvanced(), 0);
        assertEq(torna.totalOutstanding(), 0);
        assertEq(torna.issuerOutstanding(issuers[0]), 0);
        assertEq(torna.acquirerOutstanding(request().acquirerHash), 0);
        assertEq(torna.totalLpFees(), 0);
        assertEq(torna.reserveBalance(), 0);
        assertEq(torna.protocolFees(), 0);
        assertEq(torna.totalCollateral(), 3600e6);
        assertEq(torna.totalLpPrincipal(), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 13_600e6);
        assertEq(token.balanceOf(issuers[0]), 7000e6);
    }

    function assertAccounting() internal view {
        assertEq(
            token.balanceOf(address(torna)),
            torna.poolCash() + torna.totalCollateral() + torna.reserveBalance()
                + torna.protocolFees()
        );
        assertEq(torna.poolCash() + torna.totalOutstanding(), torna.poolCapacity());
        assertEq(torna.totalLpPrincipal(), 10_000e6);
        assertEq(torna.totalCollateral(), 3600e6);
    }

    function testSignedAdvancePaysFullPrincipalCollectsSeparateFeeAndRecordsPosition() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        vm.deal(req.issuer, 0);
        vm.expectEmit(true, true, false, true, address(torna));
        emit AdvanceIssued(req.refundKey, req.issuer, req.amount, req.maturity);
        assertTrue(submitWithPermit(req, sig, p));
        Position memory position = torna.positionOf(req.refundKey);
        assertTrue(position.exists);
        assertEq(position.issuer, req.issuer);
        assertEq(position.acquirerHash, req.acquirerHash);
        assertEq(position.amount, 1000e6);
        assertEq(position.fee, 3e6);
        assertEq(position.issuerMargin, 200e6);
        assertEq(position.poolCoverage, 800e6);
        assertEq(position.maturity, req.maturity);
        assertEq(position.termsVersion, 1);
        assertEq(uint8(position.state), uint8(PositionState.Advanced));
        assertEq(token.balanceOf(req.issuer), 7997e6);
        assertEq(token.balanceOf(submitter), 0);
        assertEq(req.issuer.balance, 0);
        assertEq(torna.totalLpFees(), 2_400_000);
        assertEq(torna.reserveBalance(), 399_000);
        assertEq(torna.protocolFees(), 201_000);
        assertEq(torna.collateralOf(req.issuer), 3000e6); // No per-position collateral lock.
        assertEq(torna.poolCapacity(), 10_002_400_000);
        assertEq(torna.poolCash(), 9002_400_000);
        assertEq(torna.advanceNonces(req.issuer), 1);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
        assertEq(token.nonces(req.issuer), 1);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertEq(torna.issuerOutstanding(req.issuer), 1000e6);
        assertEq(torna.acquirerOutstanding(req.acquirerHash), 1000e6);
        assertEq(torna.totalOutstanding(), 1000e6);
        assertEq(torna.totalAdvanceCount(), 1);
        assertEq(torna.totalAdvanced(), 1000e6);
        assertAccounting();
    }

    function testExistingAllowanceStillRequiresSignedAdvance() public {
        vm.prank(issuers[0]);
        token.approve(address(torna), 3e6);
        AdvanceRequest memory req = request();
        expectRejection(req, hex"0102", 3);
        assertUnchanged();
        assertTrue(submit(req, sign(req)));
        assertEq(token.nonces(req.issuer), 0);
        assertAccounting();
    }

    function testBothEntryPointsRequireSubmitterRole() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        bytes memory error = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector,
            req.issuer,
            torna.SUBMITTER_ROLE()
        );
        vm.startPrank(req.issuer);
        vm.expectRevert(error);
        torna.advance(req, sig);
        vm.expectRevert(error);
        torna.advanceWithPermit(req, sig, p);
        vm.stopPrank();
        assertUnchanged();
    }

    function testBothEntryPointsRequireCompletedInitialLiquidity() public {
        Torna empty = new Torna(token, admin, verifier, submitter);
        AdvanceRequest memory req = request();
        PermitSignature memory p;
        vm.startPrank(submitter);
        vm.expectRevert(Torna.LiquidityNotReady.selector);
        empty.advance(req, hex"");
        vm.expectRevert(Torna.LiquidityNotReady.selector);
        empty.advanceWithPermit(req, hex"", p);
        vm.stopPrank();
    }

    function testUnknownIssuerRejectedWithoutConsumingPermitOrCharging() public {
        AdvanceRequest memory req = request();
        req.issuer = issuers[2];
        expectRejection(req, sign(req), 2);
        assertUnchanged();
    }

    function testAllTamperedSignedFieldsRejected() public {
        bytes memory sig = sign(request());
        for (uint256 i; i < 7; ++i) {
            AdvanceRequest memory req = request();
            if (i == 0) req.refundKey = keccak256("other");
            if (i == 1) req.issuer = issuers[1];
            if (i == 2) req.acquirerHash = keccak256("other");
            if (i == 3) req.amount += 1;
            if (i == 4) req.maturity += 1;
            if (i == 5) req.nonce += 1;
            if (i == 6) req.deadline += 1;
            expectRejection(req, sig, 3);
            assertUnchanged();
        }
    }

    function testWrongChainAndContractSignaturesRejectAsInvalidSignature() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        vm.chainId(31337);
        expectRejection(req, sig, 3);
        vm.chainId(10143);
        Torna other = new Torna(token, admin, verifier, submitter);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, other.hashAdvanceRequest(req));
        expectRejection(req, abi.encodePacked(r, s, v), 3);
        assertUnchanged();
    }

    function testExpiredActionRejectsBeforePermit() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        vm.warp(req.deadline + 1);
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRejected(req.refundKey, 5);
        assertFalse(submitWithPermit(req, sig, p));
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertUnchanged();
    }

    function testExactActionAndPermitDeadlineAccepted() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        vm.warp(req.deadline);
        assertTrue(submitWithPermit(req, sig, p));
        assertAccounting();
    }

    function testDuplicateRefundCannotPayOrChargeTwiceEvenFromAnotherIssuer() public {
        AdvanceRequest memory req = request();
        issue(req, 0);
        expectRejection(req, sign(req), 1);
        req.issuer = issuers[1];
        req.acquirerHash = keccak256("ACQ-B");
        expectRejection(req, hex"", 1);
        assertEq(torna.totalAdvanceCount(), 1);
        assertEq(torna.totalLpFees(), 2_400_000);
        assertEq(token.balanceOf(issuers[0]), 7997e6);
        assertAccounting();
    }

    function testOldNonceWithNewKeyAndSkippedNonceRevert() public {
        AdvanceRequest memory req = request();
        req.nonce = 1;
        bytes memory sig = sign(req);
        vm.expectRevert(abi.encodeWithSelector(Torna.InvalidAdvanceNonce.selector, 0, 1));
        submit(req, sig);
        req.nonce = 0;
        issue(req, 0);
        req.refundKey = keccak256("second");
        sig = sign(req);
        vm.expectRevert(abi.encodeWithSelector(Torna.InvalidAdvanceNonce.selector, 1, 0));
        submit(req, sig);
        req.nonce = 1;
        issue(req, 0);
        assertEq(torna.advanceNonces(req.issuer), 2);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
        assertEq(torna.totalOutstanding(), 2000e6);
    }

    function testZeroKeyZeroAmountAndNonFutureMaturityRevert() public {
        for (uint256 i; i < 4; ++i) {
            AdvanceRequest memory req = request();
            if (i == 0) req.refundKey = bytes32(0);
            if (i == 1) req.amount = 0;
            if (i == 2) req.maturity = SafeCast.toUint64(block.timestamp);
            if (i == 3) req.maturity = SafeCast.toUint64(block.timestamp - 1);
            bytes memory sig = sign(req);
            vm.expectRevert(Torna.InvalidAdvanceRequest.selector);
            submit(req, sig);
            assertUnchanged();
        }
    }

    function testSignedWrongAcquirerCannotBypassExposureAccounting() public {
        AdvanceRequest memory req = request();
        bytes32 correct = req.acquirerHash;
        req.acquirerHash = keccak256("unregistered-acquirer");
        bytes memory sig = sign(req);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.AcquirerMismatch.selector, correct, req.acquirerHash)
        );
        submit(req, sig);
        assertUnchanged();
    }

    function testZeroCollateralIssuerIsSuspendedAndCannotAdvance() public {
        vm.prank(admin);
        torna.registerIssuer(issuers[2], keccak256("ACQ-C"), "NEW");
        AdvanceRequest memory req = request();
        req.issuer = issuers[2];
        req.acquirerHash = keccak256("ACQ-C");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(2), torna.hashAdvanceRequest(req));
        assertEq(uint8(torna.issuerStateOf(req.issuer)), uint8(IssuerState.Suspended));
        expectRejection(req, abi.encodePacked(r, s, v), 8);
        assertUnchanged();
    }

    function testIssuerLimitRejectsOneUnitAboveAndAcceptsExactLimit() public {
        AdvanceRequest memory req = request();
        assertEq(torna.issuerLimit(req.issuer), 5000e6);
        req.amount = 5000e6 + 1;
        expectRejection(req, sign(req), 6);
        assertUnchanged();
        req.amount -= 1;
        issue(req, 0);
        assertEq(torna.totalOutstanding(), 5000e6);
        assertAccounting();
    }

    function testIssuerLimitUsesAccumulatedOutstandingNotJustNewAmount() public {
        AdvanceRequest memory req = request();
        req.amount = 4000e6;
        issue(req, 0);
        req.refundKey = keccak256("second");
        req.nonce = 1;
        req.amount = 1100e6;
        expectRejection(req, sign(req), 6);
        assertEq(torna.totalOutstanding(), 4000e6);
        assertEq(torna.advanceNonces(req.issuer), 1);
    }

    function testRampLimitChangesAtThirtyDaysAndDoesNotUseCallerInputs() public {
        uint256 registeredAt = torna.issuerRegistrationOf(issuers[1]).registeredAt;
        vm.warp(registeredAt + 30 days - 1);
        assertEq(torna.issuerLimit(issuers[1]), 2000e6);
        AdvanceRequest memory req = request();
        req.issuer = issuers[1];
        req.acquirerHash = keccak256("ACQ-B");
        req.amount = 2000e6 + 1;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(1), torna.hashAdvanceRequest(req));
        expectRejection(req, abi.encodePacked(r, s, v), 6);
        vm.warp(registeredAt + 30 days);
        assertEq(torna.issuerLimit(issuers[1]), 4000e6);
        issue(req, 1);
    }

    function testRegisteredCountIncludesUnfundedIssuerAndNeverExpandsLimit() public {
        assertEq(torna.registeredIssuerCount(), 2);
        assertEq(torna.issuerLimit(issuers[0]), 5000e6);
        vm.prank(admin);
        torna.registerIssuer(issuers[2], keccak256("ACQ-C"), "NEW");
        assertEq(torna.registeredIssuerCount(), 3);
        assertEq(torna.issuerLimit(issuers[0]), 4000e6);
    }

    function testSharedAcquirerExposureRejectsBeforeAnyPermitOrCharge() public {
        bytes32 acquirer = request().acquirerHash;
        vm.startPrank(admin);
        torna.registerIssuer(issuers[2], acquirer, "THIRD");
        token.mint(issuers[2], 10_000e6);
        vm.stopPrank();
        fundCollateral(2, 3000e6);
        AdvanceRequest memory req = request();
        req.amount = 3000e6;
        issue(req, 0);
        req.issuer = issuers[2];
        req.refundKey = keccak256("third-refund");
        req.amount = 2003_600_001; // Capacity 10,007.2; acquirer limit 5,003.6.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(2), torna.hashAdvanceRequest(req));
        expectRejection(req, abi.encodePacked(r, s, v), 7);
        assertEq(token.balanceOf(issuers[2]), 7000e6);
        req.amount -= 1;
        issue(req, 2);
        assertEq(torna.acquirerOutstanding(acquirer), 5003_600_000);
    }

    function testDonationsCollateralReserveAndProtocolFeesDoNotBecomePoolCapacity() public {
        AdvanceRequest memory req = request();
        issue(req, 0);
        uint256 capacity = torna.poolCapacity();
        vm.prank(lps[0]);
        assertTrue(token.transfer(address(torna), 10_000e6));
        assertEq(torna.poolCapacity(), capacity);
        assertEq(torna.poolCash(), capacity - 1000e6);
        assertEq(torna.issuerLimit(req.issuer), capacity / 2);
        req.refundKey = keccak256("too-large");
        req.nonce = 1;
        req.amount = 5000e6;
        expectRejection(req, sign(req), 6);
    }

    function testMissingAndInsufficientFeeAllowanceRevertThenSameRequestCanRetry() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        vm.expectRevert(abi.encodeWithSelector(Torna.InsufficientFeeAllowance.selector, 0, 3e6));
        submit(req, sig);
        vm.prank(req.issuer);
        token.approve(address(torna), 2e6);
        vm.expectRevert(abi.encodeWithSelector(Torna.InsufficientFeeAllowance.selector, 2e6, 3e6));
        submit(req, sig);
        assertUnchanged();
        assertTrue(submitWithPermit(req, sig, permitFor(0, 3e6)));
    }

    function testIssuerMustHaveSeparateFeeBalanceBeforeReceivingPrincipal() public {
        AdvanceRequest memory req = request();
        uint256 balance = token.balanceOf(req.issuer);
        vm.prank(req.issuer);
        assertTrue(token.transfer(lps[0], balance));
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, req.issuer, 0, 3e6
            )
        );
        submitWithPermit(req, sig, p);
        assertEq(torna.advanceNonces(req.issuer), 0);
        assertEq(torna.totalAdvanceCount(), 0);
        assertEq(torna.collateralOf(req.issuer), 3000e6);
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
    }

    function testFrontRunPermitStillAllowsOnlyTheSignedAction() public {
        AdvanceRequest memory req = request();
        PermitSignature memory p = permitFor(0, 3e6);
        vm.prank(lps[0]);
        token.permit(req.issuer, address(torna), 3e6, p.deadline, p.v, p.r, p.s);
        assertTrue(submitWithPermit(req, sign(req), p));
        assertEq(token.nonces(req.issuer), 1);
        assertAccounting();
    }

    function testInvalidPermitOnlyWorksWithExistingAllowance() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory empty;
        vm.expectRevert(abi.encodeWithSelector(Torna.InsufficientFeeAllowance.selector, 0, 3e6));
        submitWithPermit(req, sig, empty);
        assertUnchanged();
        vm.prank(req.issuer);
        token.approve(address(torna), 3e6);
        assertTrue(submitWithPermit(req, sig, empty));
        assertEq(token.nonces(req.issuer), 0);
    }

    function testLimitRejectionDoesNotConsumeValidPermitOrActionNonce() public {
        AdvanceRequest memory req = request();
        req.amount = 6000e6;
        PermitSignature memory p = permitFor(0, 18e6);
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRejected(req.refundKey, 6);
        assertFalse(submitWithPermit(req, sign(req), p));
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertUnchanged();
    }

    function testFeeFailureOrShortReceiptRollsBackPermitAndAllAccounting() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        testToken.configure(1, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        submitWithPermit(req, sig, p);
        assertUnchanged();
        testToken.configure(2, hex"");
        vm.expectRevert(abi.encodeWithSelector(Torna.UnexpectedTokenReceipt.selector, 3e6, 3e6 - 1));
        submitWithPermit(req, sig, p);
        assertUnchanged();
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        testToken.configure(0, hex"");
        assertTrue(submitWithPermit(req, sig, p));
    }

    function testPrincipalFailureOrShortPaymentRollsBackFeePermitNonceAndPosition() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        testToken.configure(3, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        submitWithPermit(req, sig, p);
        assertUnchanged();
        testToken.configure(4, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.UnexpectedTokenPayment.selector, req.amount, req.amount, req.amount - 1
            )
        );
        submitWithPermit(req, sig, p);
        assertUnchanged();
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        vm.expectRevert(abi.encodeWithSelector(Torna.UnknownPosition.selector, req.refundKey));
        torna.positionOf(req.refundKey);
        testToken.configure(0, hex"");
        assertTrue(submitWithPermit(req, sig, p));
    }

    function testEarlierPermitSurvivesRevertedPaymentAndAllowsRetry() public {
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        token.permit(req.issuer, address(torna), 3e6, p.deadline, p.v, p.r, p.s);
        testToken.configure(3, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        submit(req, sig);
        assertUnchanged();
        assertEq(token.nonces(req.issuer), 1);
        assertEq(token.allowance(req.issuer, address(torna)), 3e6);
        testToken.configure(0, hex"");
        assertTrue(submit(req, sig));
    }

    function testReentrancyBlockedDuringFeeAndPrincipalTransfers() public {
        bytes32 role = torna.SUBMITTER_ROLE();
        vm.prank(admin);
        torna.grantRole(role, address(token));
        AdvanceRequest memory req = request();
        testToken.configure(5, abi.encodeCall(Torna.advance, (req, sign(req))));
        issue(req, 0);
        assertTrue(testToken.callbackBlocked());
        req.refundKey = keccak256("second");
        req.nonce = 1;
        testToken.configure(6, abi.encodeCall(Torna.advance, (req, sign(req))));
        issue(req, 0);
        assertTrue(testToken.callbackBlocked());
        assertEq(torna.totalAdvanceCount(), 2);
        assertAccounting();
    }

    function testMissingLPBackingCannotSpendCollateralInstead() public {
        testToken.destroy(address(torna), 10_000e6);
        AdvanceRequest memory req = request();
        bytes memory sig = sign(req);
        PermitSignature memory p = permitFor(0, 3e6);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InsufficientAssetBacking.selector, 3600e6, 13_600e6)
        );
        submitWithPermit(req, sig, p);
        assertEq(token.balanceOf(address(torna)), 3600e6);
        assertEq(torna.totalAdvanceCount(), 0);
        assertEq(token.nonces(req.issuer), 0);
    }

    function testPoolCashLimitCannotBorrowFromCollateralEvenWithRemainingIssuerRoom() public {
        vm.startPrank(admin);
        torna.registerIssuer(issuers[2], keccak256("ACQ-C"), "THIRD");
        token.mint(issuers[2], 10_000e6);
        vm.stopPrank();
        fundCollateral(2, 3000e6);
        for (uint256 i; i < 3; ++i) {
            AdvanceRequest memory req = request();
            req.issuer = issuers[i];
            req.acquirerHash = torna.issuerRegistrationOf(req.issuer).acquirerHash;
            req.refundKey = keccak256(abi.encode("cash", i));
            req.amount = i == 2 ? 2000e6 : 4000e6;
            issue(req, i);
        }
        assertEq(torna.poolCash(), 24e6);
        AdvanceRequest memory next = request();
        next.issuer = issuers[2];
        next.acquirerHash = keccak256("ACQ-C");
        next.nonce = 1;
        next.amount = 100e6;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(2), torna.hashAdvanceRequest(next));
        vm.expectRevert(abi.encodeWithSelector(Torna.InsufficientPoolCash.selector, 24e6, 100e6));
        submit(next, abi.encodePacked(r, s, v));
        assertEq(torna.totalOutstanding(), 10_000e6);
        assertEq(torna.totalCollateral(), 6600e6);
        assertEq(torna.totalAdvanceCount(), 3);
    }

    function testUnknownPositionIsNotConfusedWithRegisteredEnumZero() public {
        vm.expectRevert(abi.encodeWithSelector(Torna.UnknownPosition.selector, request().refundKey));
        torna.positionOf(request().refundKey);
    }

    function testFuzzFeeRoundingConservesEveryBaseUnit(uint256 amount) public view {
        (uint256 fee, uint256 lp, uint256 reserve, uint256 protocol) = torna.quoteAdvanceFee(amount);
        assertEq(fee, amount / 10_000 * 30 + amount % 10_000 * 30 / 10_000);
        assertEq(lp + reserve + protocol, fee);
        assertEq(lp, fee / 10_000 * 8000 + fee % 10_000 * 8000 / 10_000);
        assertEq(reserve, fee / 10_000 * 1330 + fee % 10_000 * 1330 / 10_000);
    }

    function testFuzzSequenceConservesTokensAndSeparatesIssuerAndAcquirerCounters(uint96 input)
        public
    {
        uint256 amount = bound(input, 1, 500e6);
        uint256 allFees;
        for (uint256 i; i < 6; ++i) {
            uint256 index = i % 2;
            AdvanceRequest memory req = request();
            req.issuer = issuers[index];
            req.acquirerHash = torna.issuerRegistrationOf(req.issuer).acquirerHash;
            req.refundKey = keccak256(abi.encode("sequence", i));
            req.nonce = torna.advanceNonces(req.issuer);
            req.amount = amount + i;
            (uint256 fee,,,) = torna.quoteAdvanceFee(req.amount);
            allFees += fee;
            issue(req, index);
            assertAccounting();
        }
        assertEq(torna.totalOutstanding(), 6 * amount + 15);
        assertEq(torna.totalAdvanceCount(), 6);
        assertEq(torna.advanceNonces(issuers[0]), 3);
        assertEq(torna.advanceNonces(issuers[1]), 3);
        assertEq(torna.issuerOutstanding(issuers[0]), 3 * amount + 6);
        assertEq(torna.issuerOutstanding(issuers[1]), 3 * amount + 9);
        assertEq(torna.acquirerOutstanding(request().acquirerHash), 3 * amount + 6);
        assertEq(torna.acquirerOutstanding(keccak256("ACQ-B")), 3 * amount + 9);
        assertEq(torna.totalLpFees() + torna.reserveBalance() + torna.protocolFees(), allFees);
        assertEq(
            token.balanceOf(address(torna)) + token.balanceOf(issuers[0])
                + token.balanceOf(issuers[1]),
            30_000e6
        );
    }
}
