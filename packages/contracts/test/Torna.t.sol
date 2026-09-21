// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import {
    AdvanceRequest,
    InvalidAddress,
    InvalidAsset,
    InvalidAssetDecimals,
    PositionState,
    IssuerState,
    AdvanceRejection,
    DepositRejection
} from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract WrongDecimalsToken is ERC20 {
    constructor() ERC20("Wrong precision", "WRONG") { }
}

contract TornaTest is ProtocolFixture {
    function testConstructorSetsOnlyIntendedRolesAndAsset() public view {
        assertEq(address(torna.asset()), address(token));
        assertTrue(torna.hasRole(torna.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(torna.hasRole(torna.VERIFIER_ROLE(), verifier));
        assertTrue(torna.hasRole(torna.SUBMITTER_ROLE(), submitter));
        assertFalse(torna.hasRole(torna.DEFAULT_ADMIN_ROLE(), submitter));
        assertFalse(torna.hasRole(torna.VERIFIER_ROLE(), issuers[0]));
        assertFalse(torna.hasRole(torna.SUBMITTER_ROLE(), verifier));
    }

    function testRejectsZeroRoleAddresses() public {
        vm.expectRevert(InvalidAddress.selector);
        new Torna(token, address(0), verifier, submitter);
        vm.expectRevert(InvalidAddress.selector);
        new Torna(token, admin, address(0), submitter);
        vm.expectRevert(InvalidAddress.selector);
        new Torna(token, admin, verifier, address(0));
    }

    function testRejectsNonContractAssetAndWrongDecimals() public {
        vm.expectRevert(abi.encodeWithSelector(InvalidAsset.selector, address(0)));
        new Torna(IERC20Metadata(address(0)), admin, verifier, submitter);
        vm.expectRevert(abi.encodeWithSelector(InvalidAsset.selector, issuers[0]));
        new Torna(IERC20Metadata(issuers[0]), admin, verifier, submitter);
        WrongDecimalsToken wrong = new WrongDecimalsToken();
        vm.expectRevert(abi.encodeWithSelector(InvalidAssetDecimals.selector, uint8(18)));
        new Torna(wrong, admin, verifier, submitter);
    }

    function testOnlyAdminCanGrantAndRevokeRoles() public {
        bytes32 role = torna.VERIFIER_ROLE();
        vm.prank(submitter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, submitter, bytes32(0)
            )
        );
        torna.grantRole(role, issuers[0]);
        vm.startPrank(admin);
        torna.grantRole(role, issuers[0]);
        assertTrue(torna.hasRole(role, issuers[0]));
        torna.revokeRole(role, issuers[0]);
        assertFalse(torna.hasRole(role, issuers[0]));
        vm.stopPrank();
    }

    function testRecoversCryptographicSigner() public view {
        AdvanceRequest memory req = request();
        assertEq(torna.recoverAdvanceSigner(req, sign(req)), issuers[0]);
    }

    function testEveryPayloadFieldIsBoundToDigest() public view {
        AdvanceRequest memory original = request();
        bytes32 digest = torna.hashAdvanceRequest(original);
        for (uint256 field; field < 7; ++field) {
            AdvanceRequest memory changed = request();
            if (field == 0) changed.refundKey = keccak256("other-refund");
            if (field == 1) changed.issuer = issuers[1];
            if (field == 2) changed.acquirerHash = keccak256("other-acquirer");
            if (field == 3) changed.amount += 1;
            if (field == 4) changed.maturity += 1;
            if (field == 5) changed.nonce += 1;
            if (field == 6) changed.deadline += 1;
            assertNotEq(torna.hashAdvanceRequest(changed), digest);
        }
    }

    function testChangedAmountDoesNotRecoverOriginalSigner() public view {
        AdvanceRequest memory req = request();
        bytes memory signature = sign(req);
        req.amount += 1;
        assertNotEq(torna.recoverAdvanceSigner(req, signature), issuers[0]);
    }

    function testOtherContractDoesNotRecoverOriginalSigner() public {
        AdvanceRequest memory req = request();
        bytes memory signature = sign(req);
        Torna other = new Torna(token, admin, verifier, submitter);
        assertNotEq(other.hashAdvanceRequest(req), torna.hashAdvanceRequest(req));
        assertNotEq(other.recoverAdvanceSigner(req, signature), issuers[0]);
    }

    function testChangedChainDoesNotRecoverOriginalSigner() public {
        AdvanceRequest memory req = request();
        bytes memory signature = sign(req);
        vm.chainId(31337);
        assertNotEq(torna.recoverAdvanceSigner(req, signature), issuers[0]);
        vm.chainId(10143);
        assertEq(torna.recoverAdvanceSigner(req, signature), issuers[0]);
    }

    function testMalformedSignatureReverts() public {
        AdvanceRequest memory req = request();
        vm.expectRevert(
            abi.encodeWithSelector(ECDSA.ECDSAInvalidSignatureLength.selector, uint256(3))
        );
        torna.recoverAdvanceSigner(req, hex"010203");
    }

    function testEip712DomainReportsActualChainAndContract() public {
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,,
        ) = torna.eip712Domain();
        assertEq(fields, bytes1(0x0f));
        assertEq(name, "Torna");
        assertEq(version, "1");
        assertEq(chainId, 10143);
        assertEq(verifyingContract, address(torna));
        vm.chainId(31337);
        (,,, chainId,,,) = torna.eip712Domain();
        assertEq(chainId, 31337);
    }

    function testWireEnumValues() public pure {
        assertEq(uint8(PositionState.Registered), 0);
        assertEq(uint8(PositionState.Advanced), 1);
        assertEq(uint8(PositionState.Repaid), 2);
        assertEq(uint8(PositionState.Overdue), 3);
        assertEq(uint8(PositionState.Review), 4);
        assertEq(uint8(PositionState.CoveredLoss), 5);
        assertEq(uint8(PositionState.CapHeld), 6);
        assertEq(uint8(PositionState.RecoveryRecorded), 7);
        assertEq(uint8(IssuerState.Active), 0);
        assertEq(uint8(IssuerState.MarginCall), 1);
        assertEq(uint8(IssuerState.Suspended), 2);
        assertEq(uint8(IssuerState.Deregistered), 3);
        assertEq(uint8(AdvanceRejection.DuplicateRefundKey), 1);
        assertEq(uint8(AdvanceRejection.UnregisteredIssuer), 2);
        assertEq(uint8(AdvanceRejection.InvalidSignature), 3);
        assertEq(uint8(AdvanceRejection.ChainMismatch), 4);
        assertEq(uint8(AdvanceRejection.DeadlineExpired), 5);
        assertEq(uint8(AdvanceRejection.IssuerLimitExceeded), 6);
        assertEq(uint8(AdvanceRejection.AcquirerExposureExceeded), 7);
        assertEq(uint8(AdvanceRejection.IssuerSuspended), 8);
        assertEq(uint8(DepositRejection.DepositCapExceeded), 1);
        assertEq(uint8(DepositRejection.ConcentrationExceeded), 2);
    }
}
