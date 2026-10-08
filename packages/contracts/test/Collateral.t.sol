// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { Torna } from "../src/Torna.sol";
import { CollateralDepositRequest, PermitSignature } from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CollateralReceiptToken is MockUSDC {
    uint8 public mode;
    bytes public callback;
    bool public callbackBlocked;
    uint256 public collateralDuringTransfer;

    constructor(address admin) MockUSDC(admin) { }

    function configure(uint8 mode_, bytes memory callback_) external {
        mode = mode_;
        callback = callback_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (mode == 1) return false;
        if (mode == 2) _burn(to, 1);
        if (mode == 3) {
            collateralDuringTransfer = Torna(to).collateralOf(from);
            (bool success, bytes memory result) = to.call(callback);
            // Only the error selector is intentionally extracted from revert data.
            // forge-lint: disable-next-line(unsafe-typecast)
            callbackBlocked =
                !success && bytes4(result) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector;
        }
        return true;
    }
}

contract CollateralTest is ProtocolFixture {
    CollateralReceiptToken internal receiptToken;
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    event CollateralDeposited(address indexed issuer, uint256 amount);

    function setUp() public override {
        super.setUp();
        receiptToken = new CollateralReceiptToken(admin);
        token = receiptToken;
        torna = new Torna(token, admin, verifier, submitter);
        vm.startPrank(admin);
        token.mint(issuers[0], 10_000e6);
        token.mint(issuers[1], 10_000e6);
        for (uint256 i; i < 3; ++i) {
            token.mint(lps[i], 20_000e6);
        }
        torna.registerIssuer(issuers[0], keccak256("ACQ-1"), "HYBRID");
        torna.registerIssuer(issuers[1], keccak256("ACQ-2"), "AURA");
        vm.stopPrank();
    }

    function depositRequest(uint256 amount)
        internal
        view
        returns (CollateralDepositRequest memory)
    {
        return CollateralDepositRequest(
            issuers[0],
            amount,
            torna.collateralDepositNonces(issuers[0]),
            block.timestamp + 10 minutes
        );
    }

    function actionSignature(CollateralDepositRequest memory req)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, torna.hashCollateralDeposit(req));
        return abi.encodePacked(r, s, v);
    }

    function permitSignature(uint256 amount) internal view returns (PermitSignature memory p) {
        p.deadline = block.timestamp + 10 minutes;
        bytes32 structHash = keccak256(
            abi.encode(
                PERMIT_TYPEHASH,
                issuers[0],
                address(torna),
                amount,
                token.nonces(issuers[0]),
                p.deadline
            )
        );
        (p.v, p.r, p.s) = vm.sign(
            testIssuerKey,
            keccak256(abi.encodePacked(hex"1901", token.DOMAIN_SEPARATOR(), structHash))
        );
    }

    function relayPermit(uint256 amount, PermitSignature memory p) internal {
        vm.prank(submitter);
        token.permit(issuers[0], address(torna), amount, p.deadline, p.v, p.r, p.s);
    }

    function submit(CollateralDepositRequest memory req, bytes memory sig) internal {
        vm.prank(submitter);
        torna.depositCollateral(req, sig);
    }

    function submitWithPermit(
        CollateralDepositRequest memory req,
        bytes memory sig,
        PermitSignature memory p
    ) internal {
        vm.prank(submitter);
        torna.depositCollateralWithPermit(req, sig, p);
    }

    function assertNoDeposit() internal view {
        assertEq(torna.collateralOf(issuers[0]), 0);
        assertEq(torna.totalCollateral(), 0);
        assertEq(torna.collateralDepositNonces(issuers[0]), 0);
        assertEq(torna.totalLpPrincipal(), 0);
    }

    function testExistingPermitMovesIssuerFundsAndCreditsOnlyIssuerCollateral() public {
        vm.deal(issuers[0], 0);
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(req.amount, permitSignature(req.amount));
        vm.expectEmit(true, false, false, true, address(torna));
        emit CollateralDeposited(req.issuer, req.amount);
        submit(req, sig);
        assertEq(token.balanceOf(issuers[0]), 7000e6);
        assertEq(token.balanceOf(address(torna)), 3000e6);
        assertEq(token.balanceOf(submitter), 0);
        assertEq(torna.collateralOf(issuers[0]), 3000e6);
        assertEq(torna.collateralOf(submitter), 0);
        assertEq(torna.collateralOf(issuers[1]), 0);
        assertEq(torna.totalCollateral(), 3000e6);
        assertEq(torna.totalLpPrincipal(), 0);
        assertEq(token.allowance(issuers[0], address(torna)), 0);
        assertEq(token.nonces(issuers[0]), 1);
        assertEq(torna.collateralDepositNonces(issuers[0]), 1);
        assertEq(issuers[0].balance, 0);
    }

    function testCombinedPermitAndDepositNeedsNoIssuerTransaction() public {
        vm.deal(issuers[0], 0);
        CollateralDepositRequest memory req = depositRequest(3000e6);
        submitWithPermit(req, actionSignature(req), permitSignature(req.amount));
        assertEq(torna.collateralOf(req.issuer), 3000e6);
        assertEq(token.balanceOf(address(torna)), 3000e6);
        assertEq(token.nonces(req.issuer), 1);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertEq(req.issuer.balance, 0);
    }

    function testOnlySubmitterCanCallEitherEntryPoint() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        bytes32 role = torna.SUBMITTER_ROLE();
        address[4] memory callers = [admin, verifier, issuers[0], lps[0]];
        for (uint256 i; i < callers.length; ++i) {
            bytes memory errorData = abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, callers[i], role
            );
            vm.prank(callers[i]);
            vm.expectRevert(errorData);
            torna.depositCollateral(req, sig);
            vm.prank(callers[i]);
            vm.expectRevert(errorData);
            torna.depositCollateralWithPermit(req, sig, p);
        }
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
    }

    function testUnregisteredIssuerAndZeroAmountAreRejectedBeforePermit() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        req.issuer = issuers[2];
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        vm.expectRevert(abi.encodeWithSelector(Torna.UnregisteredIssuer.selector, req.issuer));
        submitWithPermit(req, sig, p);
        req = depositRequest(0);
        sig = actionSignature(req);
        vm.expectRevert(Torna.InvalidCollateralAmount.selector);
        submitWithPermit(req, sig, p);
        assertNoDeposit();
        assertEq(token.nonces(issuers[0]), 0);
    }

    function testAllowanceAloneDoesNotAuthorizeCollateralDeposit() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        relayPermit(req.amount, permitSignature(req.amount));
        vm.expectRevert();
        submit(req, hex"");
        assertNoDeposit();
        assertEq(token.allowance(req.issuer, address(torna)), req.amount);
    }

    function testPermitSignatureCannotServeAsActionSignature() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        PermitSignature memory p = permitSignature(req.amount);
        bytes memory wrong = abi.encodePacked(p.r, p.s, p.v);
        vm.expectPartialRevert(Torna.InvalidCollateralSigner.selector);
        submitWithPermit(req, wrong, p);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
    }

    function testAllActionFieldsAreBoundToSignature() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(5000e6, permitSignature(5000e6));
        for (uint256 field; field < 4; ++field) {
            CollateralDepositRequest memory changed = depositRequest(3000e6);
            if (field == 0) changed.issuer = issuers[1];
            if (field == 1) changed.amount += 1;
            if (field == 2) changed.deadline += 1;
            if (field == 3) changed.nonce += 1;
            vm.expectPartialRevert(
                field == 3
                    ? Torna.InvalidCollateralNonce.selector
                    : Torna.InvalidCollateralSigner.selector
            );
            submit(changed, sig);
            assertNoDeposit();
            assertEq(torna.collateralDepositNonces(issuers[1]), 0);
        }
    }

    function testWrongChainAndContractActionSignaturesAreRejected() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(req.amount, permitSignature(req.amount));
        vm.chainId(31337);
        vm.expectPartialRevert(Torna.InvalidCollateralSigner.selector);
        submit(req, sig);
        vm.chainId(10143);
        Torna other = new Torna(token, admin, verifier, submitter);
        vm.prank(admin);
        other.registerIssuer(req.issuer, keccak256("ACQ"), "HYBRID");
        vm.prank(submitter);
        vm.expectPartialRevert(Torna.InvalidCollateralSigner.selector);
        other.depositCollateral(req, sig);
        assertNoDeposit();
        submit(req, sig);
        assertEq(torna.totalCollateral(), req.amount);
    }

    function testExpiredActionCannotUseExistingAllowance() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(req.amount, permitSignature(req.amount));
        vm.warp(req.deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.CollateralAuthorizationExpired.selector, req.deadline)
        );
        submit(req, sig);
        assertNoDeposit();
    }

    function testExactlyAtActionAndPermitDeadlineIsAccepted() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        vm.warp(req.deadline);
        submitWithPermit(req, sig, p);
        assertEq(torna.totalCollateral(), req.amount);
    }

    function testReplayCannotDepositAgainEvenWithRemainingAllowance() public {
        CollateralDepositRequest memory req = depositRequest(1000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(3000e6, permitSignature(3000e6));
        submit(req, sig);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InvalidCollateralNonce.selector, uint256(1), uint256(0))
        );
        submit(req, sig);
        assertEq(torna.totalCollateral(), 1000e6);
        assertEq(token.allowance(req.issuer, address(torna)), 2000e6);
        PermitSignature memory empty;
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InvalidCollateralNonce.selector, uint256(1), uint256(0))
        );
        submitWithPermit(req, sig, empty);
    }

    function testNewSignedDepositAddsToExistingCollateral() public {
        CollateralDepositRequest memory req = depositRequest(1000e6);
        submitWithPermit(req, actionSignature(req), permitSignature(req.amount));
        req = depositRequest(2000e6);
        submitWithPermit(req, actionSignature(req), permitSignature(req.amount));
        assertEq(torna.collateralOf(req.issuer), 3000e6);
        assertEq(torna.totalCollateral(), 3000e6);
        assertEq(token.balanceOf(req.issuer), 7000e6);
        assertEq(token.balanceOf(address(torna)), 3000e6);
        assertEq(torna.collateralDepositNonces(req.issuer), 2);
        assertEq(token.nonces(req.issuer), 2);
    }

    function testRevertedDepositPreservesPermitFromAnEarlierTransaction() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        relayPermit(req.amount, permitSignature(req.amount));
        receiptToken.configure(2, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.UnexpectedTokenReceipt.selector, req.amount, req.amount - 1
            )
        );
        submit(req, sig);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 1);
        assertEq(token.allowance(req.issuer, address(torna)), req.amount);
        assertEq(token.balanceOf(req.issuer), 10_000e6);
        receiptToken.configure(0, hex"");
        submit(req, sig);
        assertEq(torna.totalCollateral(), req.amount);
    }

    function testAnotherPartyRelayingPermitFirstDoesNotBlockSignedDeposit() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        PermitSignature memory p = permitSignature(req.amount);
        bytes memory sig = actionSignature(req);
        vm.prank(lps[0]);
        token.permit(req.issuer, address(torna), req.amount, p.deadline, p.v, p.r, p.s);
        submitWithPermit(req, sig, p);
        assertEq(torna.totalCollateral(), req.amount);
        assertEq(token.nonces(req.issuer), 1);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
    }

    function testInvalidPermitMayFallBackOnlyToExistingAllowanceAndValidAction() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        relayPermit(req.amount, permitSignature(req.amount));
        PermitSignature memory empty;
        submitWithPermit(req, actionSignature(req), empty);
        assertEq(torna.totalCollateral(), req.amount);
        assertEq(token.nonces(req.issuer), 1);
    }

    function testMissingOrInsufficientAllowanceRollsBackActionNonceAndCanRetry() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InsufficientCollateralAllowance.selector, uint256(0), req.amount
            )
        );
        submit(req, sig);
        relayPermit(1000e6, permitSignature(1000e6));
        PermitSignature memory empty;
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InsufficientCollateralAllowance.selector, uint256(1000e6), req.amount
            )
        );
        submitWithPermit(req, sig, empty);
        assertNoDeposit();
        relayPermit(req.amount, permitSignature(req.amount));
        submit(req, sig);
        assertEq(torna.totalCollateral(), req.amount);
    }

    function testInvalidPermitWithoutAllowanceCannotDeposit() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.InsufficientCollateralAllowance.selector, uint256(0), req.amount
            )
        );
        submitWithPermit(req, sig, p);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
    }

    function testInsufficientBalanceRollsBackPermitAndActionNonce() public {
        CollateralDepositRequest memory req = depositRequest(10_001e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector,
                req.issuer,
                uint256(10_000e6),
                req.amount
            )
        );
        submitWithPermit(req, sig, p);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertEq(token.balanceOf(req.issuer), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 0);
    }

    function testFalseReturningTransferRollsBackAllEffects() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        receiptToken.configure(1, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token))
        );
        submitWithPermit(req, sig, p);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.allowance(req.issuer, address(torna)), 0);
        assertEq(token.balanceOf(req.issuer), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 0);
        receiptToken.configure(0, hex"");
        submitWithPermit(req, sig, p);
        assertEq(torna.totalCollateral(), req.amount);
    }

    function testShortReceiptRollsBackAllEffects() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        PermitSignature memory p = permitSignature(req.amount);
        receiptToken.configure(2, hex"");
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.UnexpectedTokenReceipt.selector, req.amount, req.amount - 1
            )
        );
        submitWithPermit(req, sig, p);
        assertNoDeposit();
        assertEq(token.nonces(req.issuer), 0);
        assertEq(token.balanceOf(req.issuer), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 0);
    }

    function testReentrancyBlockedAndCollateralIsNotCreditedDuringTransfer() public {
        CollateralDepositRequest memory req = depositRequest(3000e6);
        bytes memory sig = actionSignature(req);
        bytes32 role = torna.SUBMITTER_ROLE();
        vm.prank(admin);
        torna.grantRole(role, address(token));
        receiptToken.configure(3, abi.encodeCall(Torna.depositCollateral, (req, sig)));
        submitWithPermit(req, sig, permitSignature(req.amount));
        assertTrue(receiptToken.callbackBlocked());
        assertEq(receiptToken.collateralDuringTransfer(), 0);
        assertEq(torna.totalCollateral(), req.amount);
        assertEq(torna.collateralDepositNonces(req.issuer), 1);
    }

    function testCollateralAndDirectDonationsDoNotCreateLPPrincipalOrCompleteBootstrap() public {
        vm.prank(lps[0]);
        assertTrue(token.transfer(address(torna), 1000e6));
        assertNoDeposit();
        CollateralDepositRequest memory req = depositRequest(3000e6);
        submitWithPermit(req, actionSignature(req), permitSignature(req.amount));
        assertEq(token.balanceOf(address(torna)), 4000e6);
        assertEq(torna.totalCollateral(), 3000e6);
        assertEq(torna.totalLpPrincipal(), 0);
        assertFalse(torna.initialLiquidityComplete());
        vm.prank(admin);
        torna.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        for (uint256 i; i < 3; ++i) {
            uint256 amount = torna.initialLiquidityAllocation(lps[i]);
            vm.startPrank(lps[i]);
            token.approve(address(torna), amount);
            torna.depositInitialLiquidity(amount);
            vm.stopPrank();
        }
        assertEq(torna.totalLpPrincipal(), 10_000e6);
        assertEq(torna.totalCollateral(), 3000e6);
        assertEq(token.balanceOf(address(torna)), 14_000e6);
        assertTrue(torna.initialLiquidityComplete());
    }

    function testFuzzMultipleIssuersConserveTokensAndHaveSeparateActionNonces(
        uint96 first,
        uint96 second
    ) public {
        uint256 amount0 = bound(first, 1, 10_000e6);
        uint256 amount1 = bound(second, 1, 10_000e6);
        CollateralDepositRequest memory req = depositRequest(amount0);
        submitWithPermit(req, actionSignature(req), permitSignature(req.amount));
        (address issuer1, uint256 key1) = makeAddrAndKey("test-issuer-1");
        req = CollateralDepositRequest(issuer1, amount1, 0, block.timestamp + 10 minutes);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, torna.hashCollateralDeposit(req));
        vm.prank(issuer1);
        token.approve(address(torna), amount1);
        submit(req, abi.encodePacked(r, s, v));
        assertEq(torna.collateralOf(issuers[0]), amount0);
        assertEq(torna.collateralOf(issuer1), amount1);
        assertEq(torna.totalCollateral(), amount0 + amount1);
        assertEq(token.balanceOf(address(torna)), amount0 + amount1);
        assertEq(
            token.balanceOf(issuers[0]) + token.balanceOf(issuer1)
                + token.balanceOf(address(torna)),
            20_000e6
        );
        assertEq(torna.collateralDepositNonces(issuers[0]), 1);
        assertEq(torna.collateralDepositNonces(issuer1), 1);
    }
}
