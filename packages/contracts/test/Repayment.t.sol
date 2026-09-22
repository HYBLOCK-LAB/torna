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
    RepaymentRequest
} from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RepaymentTestToken is MockUSDC {
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

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (mode == 1) return false;
        if (mode == 2) _burn(to, 1);
        if (mode == 3) {
            (bool success, bytes memory result) = to.call(callback);
            // Only the four-byte selector is read from the revert payload.
            // forge-lint: disable-next-line(unsafe-typecast)
            bytes4 errorSelector = bytes4(result);
            callbackBlocked =
                !success && errorSelector == ReentrancyGuard.ReentrancyGuardReentrantCall.selector;
        }
        return true;
    }
}

contract RepaymentTest is ProtocolFixture {
    RepaymentTestToken internal testToken;
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    event AdvanceRepaid(bytes32 indexed refundKey, uint256 amount);

    function setUp() public override {
        super.setUp();
        testToken = new RepaymentTestToken(admin);
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
        CollateralDepositRequest memory req = CollateralDepositRequest({
            issuer: issuer,
            amount: amount,
            nonce: torna.collateralDepositNonces(issuer),
            deadline: block.timestamp + 10 minutes
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(issuerKey(index), torna.hashCollateralDeposit(req));
        vm.prank(issuer);
        token.approve(address(torna), amount);
        vm.prank(submitter);
        torna.depositCollateral(req, abi.encodePacked(r, s, v));
    }

    function permitFor(uint256 index, uint256 value) internal returns (PermitSignature memory p) {
        p.deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                issuers[index],
                address(torna),
                value,
                token.nonces(issuers[index]),
                p.deadline
            )
        );
        (p.v, p.r, p.s) = vm.sign(
            issuerKey(index),
            keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), structHash))
        );
    }

    function issue(AdvanceRequest memory req, uint256 index) internal {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(index), torna.hashAdvanceRequest(req));
        (uint256 fee,,,) = torna.quoteAdvanceFee(req.amount);
        PermitSignature memory p = permitFor(index, fee);
        vm.prank(submitter);
        assertTrue(torna.advanceWithPermit(req, abi.encodePacked(r, s, v), p));
    }

    function repayment(AdvanceRequest memory req) internal view returns (RepaymentRequest memory) {
        return RepaymentRequest({
            refundKey: req.refundKey,
            issuer: req.issuer,
            amount: req.amount,
            nonce: torna.repaymentNonces(req.issuer),
            deadline: block.timestamp + 10 minutes
        });
    }

    function signRepayment(RepaymentRequest memory req, uint256 index)
        internal
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(issuerKey(index), torna.hashRepaymentRequest(req));
        return abi.encodePacked(r, s, v);
    }

    function repay(RepaymentRequest memory req, bytes memory sig) internal {
        vm.prank(submitter);
        torna.repay(req, sig);
    }

    function repayWithPermit(
        RepaymentRequest memory req,
        bytes memory sig,
        PermitSignature memory p
    ) internal {
        vm.prank(submitter);
        torna.repayWithPermit(req, sig, p);
    }

    function issueDefault() internal returns (AdvanceRequest memory req) {
        req = request();
        issue(req, 0);
    }

    function assertIssued(AdvanceRequest memory req) internal view {
        assertEq(uint8(torna.positionOf(req.refundKey).state), uint8(PositionState.Advanced));
        assertEq(torna.repaymentNonces(req.issuer), 0);
        assertEq(torna.totalOutstanding(), req.amount);
        assertEq(torna.issuerOutstanding(req.issuer), req.amount);
        assertEq(torna.acquirerOutstanding(req.acquirerHash), req.amount);
    }

    function assertRepaid(AdvanceRequest memory req) internal view {
        Position memory position = torna.positionOf(req.refundKey);
        assertEq(uint8(position.state), uint8(PositionState.Repaid));
        assertEq(torna.repaymentNonces(req.issuer), 1);
        assertEq(torna.totalOutstanding(), 0);
        assertEq(torna.issuerOutstanding(req.issuer), 0);
        assertEq(torna.acquirerOutstanding(req.acquirerHash), 0);
        assertEq(torna.totalAdvanceCount(), 1);
        assertEq(torna.totalAdvanced(), req.amount);
        assertEq(torna.totalLpFees(), 2_400_000);
        assertEq(torna.reserveBalance(), 399_000);
        assertEq(torna.protocolFees(), 201_000);
        assertEq(torna.poolCash(), torna.poolCapacity());
        assertEq(
            token.balanceOf(address(torna)),
            torna.poolCash() + torna.totalCollateral() + torna.reserveBalance()
                + torna.protocolFees()
        );
    }

    function testRepayWithExistingAllowanceReturnsFullPrincipalAndChangesOnlyOutstanding() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        vm.prank(req.issuer);
        token.approve(address(torna), req.amount);
        vm.expectEmit(true, false, false, true, address(torna));
        emit AdvanceRepaid(req.refundKey, req.amount);
        repay(req, signRepayment(req, 0));
        assertEq(token.balanceOf(req.issuer), 6997e6);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertRepaid(advanceRequest);
    }

    function testPermitLetsSubmitterRepayForIssuerWithNoNativeGas() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        vm.deal(req.issuer, 0);
        repayWithPermit(req, signRepayment(req, 0), permitFor(0, req.amount));
        assertEq(req.issuer.balance, 0);
        assertEq(token.nonces(req.issuer), 2); // Advance fee Permit, then repayment Permit.
        assertRepaid(advanceRequest);
    }

    function testBothEntryPointsRequireSubmitterRole() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        PermitSignature memory p = permitFor(0, req.amount);
        bytes memory error = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector,
            req.issuer,
            torna.SUBMITTER_ROLE()
        );
        vm.startPrank(req.issuer);
        vm.expectRevert(error);
        torna.repay(req, sig);
        vm.expectRevert(error);
        torna.repayWithPermit(req, sig, p);
        vm.stopPrank();
        assertIssued(advanceRequest);
    }

    function testUnknownPositionAndNonAdvancedPositionCannotRepay() public {
        RepaymentRequest memory unknown = RepaymentRequest({
            refundKey: keccak256("unknown"),
            issuer: issuers[0],
            amount: 1000e6,
            nonce: 0,
            deadline: block.timestamp + 10 minutes
        });
        vm.expectRevert(abi.encodeWithSelector(Torna.UnknownPosition.selector, unknown.refundKey));
        repay(unknown, hex"");

        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        repayWithPermit(req, signRepayment(req, 0), permitFor(0, req.amount));
        bytes memory replaySignature = signRepayment(req, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InvalidRepaymentState.selector, req.refundKey, PositionState.Repaid
            )
        );
        repay(req, replaySignature);
        assertRepaid(advanceRequest);
    }

    function testOnlyExactFullPrincipalForPositionIsAccepted() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        req.amount -= 1;
        bytes memory shortSignature = signRepayment(req, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.RepaymentAmountMismatch.selector, advanceRequest.amount, req.amount
            )
        );
        repay(req, shortSignature);
        req.amount = advanceRequest.amount + 1;
        bytes memory excessSignature = signRepayment(req, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.RepaymentAmountMismatch.selector, advanceRequest.amount, req.amount
            )
        );
        repay(req, excessSignature);
        assertIssued(advanceRequest);
    }

    function testIssuerFieldMustMatchPositionEvenWithThatIssuersSignature() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        req.issuer = issuers[1];
        bytes memory sig = signRepayment(req, 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.RepaymentIssuerMismatch.selector, advanceRequest.issuer, req.issuer
            )
        );
        repay(req, sig);
        assertIssued(advanceRequest);
    }

    function testWrongSignerWrongDomainAndTamperedDeadlineCannotAuthorize() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory wrongSigner = signRepayment(req, 1);
        vm.expectPartialRevert(Torna.InvalidRepaymentSigner.selector);
        repay(req, wrongSigner);

        bytes memory original = signRepayment(req, 0);
        req.deadline += 1;
        vm.expectPartialRevert(Torna.InvalidRepaymentSigner.selector);
        repay(req, original);

        req.deadline -= 1;
        vm.chainId(31337);
        vm.expectPartialRevert(Torna.InvalidRepaymentSigner.selector);
        repay(req, original);
        vm.chainId(10143);
        assertIssued(advanceRequest);
    }

    function testNonceAndDeadlineAreIndependentAndExactDeadlineIsValid() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        req.nonce = 1;
        bytes memory wrongNonceSignature = signRepayment(req, 0);
        vm.expectRevert(abi.encodeWithSelector(Torna.InvalidRepaymentNonce.selector, 0, 1));
        repay(req, wrongNonceSignature);
        req.nonce = 0;
        bytes memory sig = signRepayment(req, 0);
        vm.warp(req.deadline);
        repayWithPermit(req, sig, permitFor(0, req.amount));
        assertEq(torna.advanceNonces(req.issuer), 1);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
        assertEq(torna.repaymentNonces(req.issuer), 1);
        assertRepaid(advanceRequest);
    }

    function testExpiredActionCannotUseExistingAllowanceOrPermit() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        PermitSignature memory p = permitFor(0, req.amount);
        vm.prank(req.issuer);
        token.approve(address(torna), req.amount);
        vm.warp(req.deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.RepaymentAuthorizationExpired.selector, req.deadline)
        );
        repayWithPermit(req, sig, p);
        assertEq(torna.repaymentNonces(req.issuer), 0);
        assertEq(token.nonces(req.issuer), 1);
        assertEq(token.allowance(req.issuer, address(torna)), req.amount);
        assertIssued(advanceRequest);
    }

    function testAllowanceAloneDoesNotAuthorizeRepayment() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        vm.prank(req.issuer);
        token.approve(address(torna), req.amount);
        vm.expectRevert();
        repay(req, hex"0102");
        assertEq(token.allowance(req.issuer, address(torna)), req.amount);
        assertIssued(advanceRequest);
    }

    function testMissingAllowanceRollsBackActionNonceAndCanRetry() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InsufficientRepaymentAllowance.selector, 0, req.amount)
        );
        repay(req, sig);
        assertIssued(advanceRequest);
        repayWithPermit(req, sig, permitFor(0, req.amount));
        assertRepaid(advanceRequest);
    }

    function testFrontRunOrInvalidPermitNeedsValidActionAndActualAllowance() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        PermitSignature memory p = permitFor(0, req.amount);
        vm.prank(lps[0]);
        token.permit(req.issuer, address(torna), req.amount, p.deadline, p.v, p.r, p.s);
        repayWithPermit(req, signRepayment(req, 0), p);
        assertRepaid(advanceRequest);

        AdvanceRequest memory second = request();
        second.refundKey = keccak256("second");
        second.nonce = 1;
        issue(second, 0);
        RepaymentRequest memory secondRepayment = repayment(second);
        PermitSignature memory empty;
        bytes memory secondSignature = signRepayment(secondRepayment, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InsufficientRepaymentAllowance.selector, 0, secondRepayment.amount
            )
        );
        repayWithPermit(secondRepayment, secondSignature, empty);
        assertEq(torna.repaymentNonces(secondRepayment.issuer), 1);
        assertEq(uint8(torna.positionOf(second.refundKey).state), uint8(PositionState.Advanced));
    }

    function testFalseReturnAndShortReceiptRollBackPermitNonceAndAccounting() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        PermitSignature memory p = permitFor(0, req.amount);
        testToken.configure(1, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        repayWithPermit(req, sig, p);
        assertEq(token.nonces(req.issuer), 1);
        assertIssued(advanceRequest);

        testToken.configure(2, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.UnexpectedTokenPayment.selector, req.amount, req.amount, req.amount - 1
            )
        );
        repayWithPermit(req, sig, p);
        assertEq(token.nonces(req.issuer), 1);
        assertIssued(advanceRequest);

        testToken.configure(0, hex"");
        repayWithPermit(req, sig, p);
        assertRepaid(advanceRequest);
    }

    function testExistingPermitSurvivesRevertedTransferAndAllowsRetry() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        PermitSignature memory p = permitFor(0, req.amount);
        token.permit(req.issuer, address(torna), req.amount, p.deadline, p.v, p.r, p.s);
        testToken.configure(1, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        repay(req, sig);
        assertEq(token.allowance(req.issuer, address(torna)), req.amount);
        assertEq(token.nonces(req.issuer), 2);
        assertIssued(advanceRequest);
        testToken.configure(0, hex"");
        repay(req, sig);
        assertRepaid(advanceRequest);
    }

    function testBackingDeficitRollsBackRepaymentInsteadOfMaskingMissingLPAssets() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        PermitSignature memory p = permitFor(0, req.amount);
        bytes memory sig = signRepayment(req, 0);
        testToken.destroy(address(torna), 1);
        vm.expectPartialRevert(Torna.InsufficientAssetBacking.selector);
        repayWithPermit(req, sig, p);
        assertEq(token.nonces(req.issuer), 1);
        assertIssued(advanceRequest);
    }

    function testReentrancyIsBlockedBeforeRepaymentCanBeRecordedTwice() public {
        AdvanceRequest memory advanceRequest = issueDefault();
        RepaymentRequest memory req = repayment(advanceRequest);
        bytes memory sig = signRepayment(req, 0);
        bytes32 role = torna.SUBMITTER_ROLE();
        vm.prank(admin);
        torna.grantRole(role, address(token));
        testToken.configure(3, abi.encodeCall(Torna.repay, (req, sig)));
        repayWithPermit(req, sig, permitFor(0, req.amount));
        assertTrue(testToken.callbackBlocked());
        assertRepaid(advanceRequest);
    }
}
