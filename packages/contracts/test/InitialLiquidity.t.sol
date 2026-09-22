// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { Limits } from "../src/libraries/Limits.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Only a gate probe, not an implementation of advance or ordinary deposits.
contract LiquidityGateHarness is Torna {
    constructor(IERC20Metadata asset_, address admin, address verifier, address submitter)
        Torna(asset_, admin, verifier, submitter)
    { }

    function gateProbe() external view whenLiquidityReady returns (bool) {
        return true;
    }

    function ordinaryDepositRoom(address lp, uint256 outstanding) external view returns (uint256) {
        return Limits.depositRoom(totalLpPrincipal, lpPrincipal[lp], outstanding);
    }
}

contract AdversarialReceiptToken is ERC20 {
    uint8 public mode;
    bool public callbackBlocked;
    bool public readyDuringCallback;

    constructor() ERC20("Receipt test", "RCT") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setMode(uint8 mode_) external {
        mode = mode_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (mode == 1) return false;
        if (mode == 2) _burn(to, 1);
        if (mode == 3) {
            readyDuringCallback = Torna(to).initialLiquidityComplete();
            (bool success, bytes memory result) =
                to.call(abi.encodeCall(Torna.depositInitialLiquidity, (amount)));
            callbackBlocked =
                !success && bytes4(result) == ReentrancyGuard.ReentrancyGuardReentrantCall.selector;
        }
        return true;
    }
}

contract InitialLiquidityTest is ProtocolFixture {
    LiquidityGateHarness internal pool;

    function setUp() public override {
        super.setUp();
        pool = new LiquidityGateHarness(token, admin, verifier, submitter);
    }

    function configure() internal {
        vm.prank(admin);
        pool.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
    }

    function fund(uint256 index) internal {
        uint256 amount = pool.initialLiquidityAllocation(lps[index]);
        vm.startPrank(lps[index]);
        token.approve(address(pool), amount);
        pool.depositInitialLiquidity(amount);
        vm.stopPrank();
    }

    function testOnlyAdminCanConfigure() public {
        vm.prank(submitter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, submitter, bytes32(0)
            )
        );
        pool.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        assertFalse(pool.initialLiquidityConfigured());
    }

    function testConfigurationFixesExactAmountsOnce() public {
        configure();
        assertTrue(pool.initialLiquidityConfigured());
        assertEq(pool.initialLiquidityAllocation(lps[0]), 5000e6);
        assertEq(pool.initialLiquidityAllocation(lps[1]), 3000e6);
        assertEq(pool.initialLiquidityAllocation(lps[2]), 2000e6);
        vm.prank(admin);
        vm.expectRevert(Torna.BootstrapAlreadyConfigured.selector);
        pool.configureInitialLiquidity([lps[3], lps[4], lps[5]]);
    }

    function testInvalidConfigurationRollsBackAndCanBeRetried() public {
        address[3] memory invalid = [address(0), address(pool), lps[0]];
        for (uint256 i; i < invalid.length; ++i) {
            vm.prank(admin);
            vm.expectRevert(abi.encodeWithSelector(Torna.InvalidBootstrapLP.selector, invalid[i]));
            pool.configureInitialLiquidity([lps[0], lps[1], invalid[i]]);
            assertFalse(pool.initialLiquidityConfigured());
            assertEq(pool.initialLiquidityAllocation(lps[0]), 0);
        }
        configure();
    }

    function testDepositBeforeConfigurationReverts() public {
        vm.prank(lps[0]);
        vm.expectRevert(Torna.BootstrapNotConfigured.selector);
        pool.depositInitialLiquidity(5000e6);
    }

    function testUnlistedLPAndAdminCannotUseException() public {
        configure();
        address[2] memory outsiders = [lps[3], admin];
        for (uint256 i; i < outsiders.length; ++i) {
            vm.prank(outsiders[i]);
            vm.expectRevert(abi.encodeWithSelector(Torna.InvalidBootstrapLP.selector, outsiders[i]));
            pool.depositInitialLiquidity(5000e6);
        }
    }

    function testFuzzOnlyExactAllocationAccepted(uint256 amount) public {
        configure();
        vm.assume(amount != 5000e6);
        vm.prank(lps[0]);
        vm.expectRevert(
            abi.encodeWithSelector(Torna.InvalidBootstrapAmount.selector, uint256(5000e6), amount)
        );
        pool.depositInitialLiquidity(amount);
        assertEq(pool.totalLpPrincipal(), 0);
        assertFalse(pool.initialLiquidityDeposited(lps[0]));
    }

    function testExactFundingMovesTokensAndRecordsPrincipalAndEvent() public {
        configure();
        vm.startPrank(lps[0]);
        token.approve(address(pool), 5000e6);
        vm.expectEmit(true, false, false, true, address(pool));
        emit LiquidityDeposited(lps[0], 5000e6);
        pool.depositInitialLiquidity(5000e6);
        vm.stopPrank();
        assertEq(pool.lpPrincipal(lps[0]), 5000e6);
        assertEq(pool.totalLpPrincipal(), 5000e6);
        assertEq(token.balanceOf(address(pool)), 5000e6);
        assertEq(token.balanceOf(lps[0]), 15_000e6);
        assertEq(token.allowance(lps[0], address(pool)), 0);
        assertTrue(pool.initialLiquidityDeposited(lps[0]));
        assertFalse(pool.initialLiquidityComplete());
    }

    event LiquidityDeposited(address indexed lp, uint256 amount);
    event InitialLiquidityCompleted(uint256 totalPrincipal);

    function testDuplicateInitialDepositReverts() public {
        configure();
        fund(0);
        vm.prank(lps[0]);
        vm.expectRevert(abi.encodeWithSelector(Torna.BootstrapAlreadyDeposited.selector, lps[0]));
        pool.depositInitialLiquidity(5000e6);
        assertEq(pool.totalLpPrincipal(), 5000e6);
    }

    function testMissingAllowanceRollsBackAndRetrySucceeds() public {
        configure();
        vm.prank(lps[0]);
        vm.expectRevert();
        pool.depositInitialLiquidity(5000e6);
        assertEq(pool.totalLpPrincipal(), 0);
        assertEq(pool.lpPrincipal(lps[0]), 0);
        assertFalse(pool.initialLiquidityDeposited(lps[0]));
        fund(0);
        assertEq(pool.totalLpPrincipal(), 5000e6);
    }

    function testGateRequiresAllThreeDeposits() public {
        vm.expectRevert(Torna.LiquidityNotReady.selector);
        pool.gateProbe();
        configure();
        for (uint256 i; i < 3; ++i) {
            vm.expectRevert(Torna.LiquidityNotReady.selector);
            pool.gateProbe();
            fund(i);
        }
        assertTrue(pool.gateProbe());
        assertEq(pool.totalLpPrincipal(), 10_000e6);
    }

    function testCompletionEventAndPermanentClosureEvenForAdmin() public {
        configure();
        fund(0);
        fund(1);
        vm.startPrank(lps[2]);
        token.approve(address(pool), 2000e6);
        vm.expectEmit(true, false, false, true, address(pool));
        emit LiquidityDeposited(lps[2], 2000e6);
        vm.expectEmit(false, false, false, true, address(pool));
        emit InitialLiquidityCompleted(10_000e6);
        pool.depositInitialLiquidity(2000e6);
        vm.stopPrank();
        vm.prank(lps[0]);
        vm.expectRevert(Torna.BootstrapClosed.selector);
        pool.depositInitialLiquidity(5000e6);
        vm.prank(admin);
        vm.expectRevert(Torna.BootstrapAlreadyConfigured.selector);
        pool.configureInitialLiquidity([lps[3], lps[4], lps[5]]);
        assertTrue(pool.initialLiquidityComplete());
    }

    function testFuzzFundingOrderDoesNotChangeResult(uint8 order) public {
        configure();
        uint256 first = uint256(order) % 3;
        uint256 second = (first + 1 + (uint256(order) / 3) % 2) % 3;
        uint256 third = 3 - first - second;
        fund(first);
        fund(second);
        assertFalse(pool.initialLiquidityComplete());
        fund(third);
        assertTrue(pool.initialLiquidityComplete());
        assertEq(pool.totalLpPrincipal(), 10_000e6);
        assertEq(token.balanceOf(address(pool)), 10_000e6);
        assertLe(pool.totalLpPrincipal(), Limits.depositCap(0));
    }

    function testDirectTokenDonationCannotCompleteOrCreatePrincipal() public {
        configure();
        vm.prank(lps[3]);
        token.transfer(address(pool), 10_000e6);
        assertFalse(pool.initialLiquidityComplete());
        assertEq(pool.totalLpPrincipal(), 0);
        assertEq(pool.lpPrincipal(lps[3]), 0);
        fund(0);
        fund(1);
        fund(2);
        assertTrue(pool.initialLiquidityComplete());
        assertEq(pool.totalLpPrincipal(), 10_000e6);
        assertEq(token.balanceOf(address(pool)), 20_000e6);
    }

    function testOrdinaryLimitsStillApplyToRecordedBootstrapPrincipal() public {
        configure();
        fund(0);
        fund(1);
        fund(2);
        assertEq(pool.ordinaryDepositRoom(lps[0], 0), 0);
        assertEq(pool.ordinaryDepositRoom(lps[1], 0), 1_166_666_666);
        assertEq(pool.ordinaryDepositRoom(lps[2], 0), 2_166_666_666);
        assertEq(pool.ordinaryDepositRoom(lps[3], 0), 4_166_666_666);
    }

    function receiptPool() internal returns (AdversarialReceiptToken odd, Torna target) {
        odd = new AdversarialReceiptToken();
        target = new Torna(odd, admin, verifier, submitter);
        vm.prank(admin);
        target.configureInitialLiquidity([lps[0], lps[1], lps[2]]);
        for (uint256 i; i < 3; ++i) {
            uint256 amount = target.initialLiquidityAllocation(lps[i]);
            odd.mint(lps[i], amount);
            vm.prank(lps[i]);
            odd.approve(address(target), amount);
        }
    }

    function testFalseReturningTransferRollsBackTokenAndPoolState() public {
        (AdversarialReceiptToken odd, Torna target) = receiptPool();
        odd.setMode(1);
        vm.prank(lps[0]);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(odd))
        );
        target.depositInitialLiquidity(5000e6);
        assertEq(odd.balanceOf(lps[0]), 5000e6);
        assertEq(odd.balanceOf(address(target)), 0);
        assertEq(target.lpPrincipal(lps[0]), 0);
        assertEq(target.totalLpPrincipal(), 0);
        assertFalse(target.initialLiquidityDeposited(lps[0]));
        odd.setMode(0);
        vm.prank(lps[0]);
        target.depositInitialLiquidity(5000e6);
        assertEq(target.totalLpPrincipal(), 5000e6);
    }

    function testShortFinalReceiptRollsBackCompletionAndCanRetry() public {
        (AdversarialReceiptToken odd, Torna target) = receiptPool();
        vm.prank(lps[0]);
        target.depositInitialLiquidity(5000e6);
        vm.prank(lps[1]);
        target.depositInitialLiquidity(3000e6);
        odd.setMode(2);
        vm.prank(lps[2]);
        vm.expectRevert(
            abi.encodeWithSelector(
                Torna.UnexpectedTokenReceipt.selector, uint256(2000e6), uint256(2000e6 - 1)
            )
        );
        target.depositInitialLiquidity(2000e6);
        assertFalse(target.initialLiquidityComplete());
        assertFalse(target.initialLiquidityDeposited(lps[2]));
        assertEq(target.lpPrincipal(lps[2]), 0);
        assertEq(target.totalLpPrincipal(), 8000e6);
        assertEq(odd.balanceOf(address(target)), 8000e6);
        assertEq(odd.balanceOf(lps[2]), 2000e6);
        assertEq(odd.allowance(lps[2], address(target)), 2000e6);
        odd.setMode(0);
        vm.prank(lps[2]);
        target.depositInitialLiquidity(2000e6);
        assertTrue(target.initialLiquidityComplete());
    }

    function testReentrantDepositBlockedAndFinalReceiptNotPrematurelyReady() public {
        (AdversarialReceiptToken odd, Torna target) = receiptPool();
        odd.setMode(3);
        for (uint256 i; i < 3; ++i) {
            uint256 amount = target.initialLiquidityAllocation(lps[i]);
            vm.prank(lps[i]);
            target.depositInitialLiquidity(amount);
            assertTrue(odd.callbackBlocked());
            assertFalse(odd.readyDuringCallback());
        }
        assertTrue(target.initialLiquidityComplete());
        assertEq(target.totalLpPrincipal(), 10_000e6);
        assertEq(odd.balanceOf(address(target)), 10_000e6);
    }
}
