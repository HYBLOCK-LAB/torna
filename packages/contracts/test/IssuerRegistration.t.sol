// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { IssuerRegistration, InvalidAddress, InvalidIssuerCount } from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

contract IssuerRegistrationTest is ProtocolFixture {
    event IssuerRegistered(address indexed issuer, bytes32 acquirerHash, string name);
    event BootstrapRampExempted(address indexed issuer);

    function register(uint256 index, string memory acquirerId, string memory name) internal {
        vm.prank(admin);
        torna.registerIssuer(issuers[index], keccak256(bytes(acquirerId)), name);
    }

    function testAdminRegistersMetadataAndEmitsPRDEvent() public {
        vm.warp(1_800_000_000);
        bytes32 acquirerHash = keccak256(bytes(unicode"ACQ-α"));
        vm.prank(admin);
        vm.expectEmit(true, false, false, true, address(torna));
        emit IssuerRegistered(issuers[0], acquirerHash, "HYBRID Travel Card");
        torna.registerIssuer(issuers[0], acquirerHash, "HYBRID Travel Card");
        IssuerRegistration memory registration = torna.issuerRegistrationOf(issuers[0]);
        assertTrue(registration.exists);
        assertEq(registration.registeredAt, 1_800_000_000);
        assertEq(registration.acquirerHash, acquirerHash);
        assertEq(registration.name, "HYBRID Travel Card");
        assertTrue(torna.isIssuerRamping(issuers[0]));
        assertEq(token.balanceOf(address(torna)), 0);
    }

    function testNonAdminRolesAndIssuerCannotRegister() public {
        address[4] memory callers = [submitter, verifier, issuers[0], lps[0]];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(
                abi.encodeWithSelector(
                    IAccessControl.AccessControlUnauthorizedAccount.selector, callers[i], bytes32(0)
                )
            );
            torna.registerIssuer(issuers[0], keccak256("ACQ"), "Test issuer");
        }
        vm.expectRevert(abi.encodeWithSelector(Torna.UnregisteredIssuer.selector, issuers[0]));
        torna.issuerRegistrationOf(issuers[0]);
    }

    function testRejectsZeroAndSelfIssuerAddresses() public {
        address[2] memory invalid = [address(0), address(torna)];
        for (uint256 i; i < invalid.length; ++i) {
            vm.prank(admin);
            vm.expectRevert(InvalidAddress.selector);
            torna.registerIssuer(invalid[i], keccak256("ACQ"), "Test issuer");
        }
    }

    function testInvalidMetadataDoesNotConsumeRegistration() public {
        vm.startPrank(admin);
        vm.expectRevert(Torna.InvalidIssuerMetadata.selector);
        torna.registerIssuer(issuers[0], bytes32(0), "Test issuer");
        vm.expectRevert(Torna.InvalidIssuerMetadata.selector);
        torna.registerIssuer(issuers[0], keccak256("ACQ"), "");
        vm.stopPrank();
        vm.expectRevert(abi.encodeWithSelector(Torna.UnregisteredIssuer.selector, issuers[0]));
        torna.issuerRegistrationOf(issuers[0]);
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        assertTrue(torna.issuerRegistrationOf(issuers[0]).exists);
    }

    function testDuplicateCannotReplaceMetadataOrResetRegistrationTime() public {
        vm.warp(1_800_000_000);
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        vm.warp(1_800_000_000 + 30 days);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Torna.IssuerAlreadyRegistered.selector, issuers[0]));
        torna.registerIssuer(issuers[0], keccak256("other-acquirer"), "Replacement name");
        IssuerRegistration memory registration = torna.issuerRegistrationOf(issuers[0]);
        assertEq(registration.registeredAt, 1_800_000_000);
        assertEq(registration.acquirerHash, keccak256(bytes(unicode"ACQ-α")));
        assertEq(registration.name, "HYBRID Travel Card");
        assertFalse(torna.isIssuerRamping(issuers[0]));
    }

    function testUnregisteredIssuerCannotUseMetadataRampOrLimitQueries() public {
        bytes memory errorData =
            abi.encodeWithSelector(Torna.UnregisteredIssuer.selector, issuers[0]);
        vm.expectRevert(errorData);
        torna.issuerRegistrationOf(issuers[0]);
        vm.expectRevert(errorData);
        torna.isIssuerRamping(issuers[0]);
        vm.expectRevert(errorData);
        torna.previewIssuerLimit(issuers[0], 600e6, 10_000e6, 2);
    }

    function testThirtyDayBoundaryChangesCollateralLimitFromHalfToFull() public {
        vm.warp(1_800_000_000);
        register(1, unicode"ACQ-β", "AURA Travel Card");
        uint256 end = 1_800_000_000 + 30 days;
        assertEq(torna.ISSUER_RAMP_PERIOD(), 30 days);
        assertTrue(torna.isIssuerRamping(issuers[1]));
        assertEq(torna.previewIssuerLimit(issuers[1], 600e6, 10_000e6, 2), 2000e6);
        vm.warp(end - 1);
        assertTrue(torna.isIssuerRamping(issuers[1]));
        assertEq(torna.previewIssuerLimit(issuers[1], 600e6, 10_000e6, 2), 2000e6);
        vm.warp(end);
        assertFalse(torna.isIssuerRamping(issuers[1]));
        assertEq(torna.previewIssuerLimit(issuers[1], 600e6, 10_000e6, 2), 4000e6);
        vm.warp(end + 1);
        assertEq(torna.previewIssuerLimit(issuers[1], 600e6, 10_000e6, 2), 4000e6);
    }

    function testPoolConcentrationStillCapsMatureAndNewIssuers() public {
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        // Half of the collateral-backed 20,000 is 10,000, but the pool cap is 5,000.
        assertEq(torna.previewIssuerLimit(issuers[0], 3000e6, 10_000e6, 2), 5000e6);
        vm.warp(block.timestamp + 30 days);
        assertEq(torna.previewIssuerLimit(issuers[0], 3000e6, 10_000e6, 2), 5000e6);
    }

    function testZeroCollateralOrCapacityHasNoCreditAndZeroCountReverts() public {
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        assertEq(torna.previewIssuerLimit(issuers[0], 0, 10_000e6, 2), 0);
        assertEq(torna.previewIssuerLimit(issuers[0], 3000e6, 0, 2), 0);
        vm.expectRevert(InvalidIssuerCount.selector);
        torna.previewIssuerLimit(issuers[0], 3000e6, 10_000e6, 0);
    }

    function testTimestampZeroStillRepresentsAnExistingIssuer() public {
        vm.warp(0);
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        assertTrue(torna.issuerRegistrationOf(issuers[0]).exists);
        assertEq(torna.issuerRegistrationOf(issuers[0]).registeredAt, 0);
        assertTrue(torna.isIssuerRamping(issuers[0]));
        vm.warp(30 days);
        assertFalse(torna.isIssuerRamping(issuers[0]));
    }

    function testApprovedDemoExemptsTwoRealTimeRegistrationsAndRampsThreeNewOnes() public {
        vm.warp(1_800_000_000);
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        register(1, unicode"ACQ-β", "AURA Travel Card");
        for (uint256 i = 2; i < 5; ++i) {
            vm.expectRevert(abi.encodeWithSelector(Torna.UnregisteredIssuer.selector, issuers[i]));
            torna.issuerRegistrationOf(issuers[i]);
        }

        vm.startPrank(admin);
        vm.expectEmit(true, false, false, false, address(torna));
        emit BootstrapRampExempted(issuers[0]);
        torna.exemptBootstrapIssuerFromRamp(issuers[0]);
        vm.expectEmit(true, false, false, false, address(torna));
        emit BootstrapRampExempted(issuers[1]);
        torna.exemptBootstrapIssuerFromRamp(issuers[1]);
        vm.stopPrank();
        assertEq(torna.issuerRegistrationOf(issuers[0]).registeredAt, block.timestamp);
        assertEq(torna.issuerRegistrationOf(issuers[1]).registeredAt, block.timestamp);
        assertFalse(torna.isIssuerRamping(issuers[0]));
        assertFalse(torna.isIssuerRamping(issuers[1]));
        assertEq(torna.previewIssuerLimit(issuers[1], 600e6, 10_000e6, 2), 4000e6);

        // Registration portion of t9 only, with no simulated calendar jump.
        register(2, unicode"ACQ-γ", "NOVA Travel Card");
        register(3, unicode"ACQ-δ", "MERIDIAN Travel Card");
        register(4, unicode"ACQ-ε", "KITE Travel Card");
        for (uint256 i = 2; i < 5; ++i) {
            assertTrue(torna.isIssuerRamping(issuers[i]));
            assertEq(torna.issuerRegistrationOf(issuers[i]).registeredAt, block.timestamp);
        }
        // Illustrative supplied capacity/count, not yet stored accounting or a count policy.
        assertEq(torna.previewIssuerLimit(issuers[2], 900e6, 15_000e6, 5), 3000e6);
        assertEq(torna.previewIssuerLimit(issuers[3], 750e6, 15_000e6, 5), 2500e6);
        assertEq(torna.previewIssuerLimit(issuers[4], 600e6, 15_000e6, 5), 2000e6);
        assertFalse(torna.isIssuerRamping(issuers[0]));
        assertFalse(torna.isIssuerRamping(issuers[1]));
    }

    function testRampExemptionRejectsUnknownDuplicateLaterAndNonAdmin() public {
        vm.prank(admin);
        vm.expectRevert(Torna.BootstrapRampExemptionUnavailable.selector);
        torna.exemptBootstrapIssuerFromRamp(issuers[0]);

        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        register(1, unicode"ACQ-β", "AURA Travel Card");
        vm.prank(submitter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, submitter, bytes32(0)
            )
        );
        torna.exemptBootstrapIssuerFromRamp(issuers[0]);

        vm.prank(admin);
        torna.exemptBootstrapIssuerFromRamp(issuers[0]);
        vm.prank(admin);
        vm.expectRevert(Torna.BootstrapRampExemptionUnavailable.selector);
        torna.exemptBootstrapIssuerFromRamp(issuers[0]);

        register(2, unicode"ACQ-γ", "NOVA Travel Card");
        vm.prank(admin);
        vm.expectRevert(Torna.BootstrapRampExemptionUnavailable.selector);
        torna.exemptBootstrapIssuerFromRamp(issuers[2]);
        assertTrue(torna.isIssuerRamping(issuers[2]));
    }

    function testFuzzRampUsesEachRegistrationTime(uint48 start, uint32 elapsed) public {
        vm.warp(start);
        register(0, unicode"ACQ-α", "HYBRID Travel Card");
        vm.warp(uint256(start) + elapsed);
        assertEq(torna.isIssuerRamping(issuers[0]), uint256(elapsed) < 30 days);
        assertEq(torna.issuerRegistrationOf(issuers[0]).registeredAt, start);
    }
}
