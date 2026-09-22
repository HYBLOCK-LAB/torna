// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test-only spender; not Torna's future deposit or accounting implementation.
contract PermitSpenderProbe {
    function pull(MockUSDC token, address owner, uint256 amount) external {
        require(token.transferFrom(owner, address(this), amount));
    }
}

contract PermitTest is ProtocolFixture {
    bytes32 internal constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    struct Approval {
        address owner;
        address spender;
        uint256 value;
        uint256 nonce;
        uint256 deadline;
    }

    function approval() internal view returns (Approval memory) {
        return Approval(
            issuers[0],
            address(torna),
            3000e6,
            token.nonces(issuers[0]),
            block.timestamp + 10 minutes
        );
    }

    function digest(Approval memory a, bytes32 domain) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, a.owner, a.spender, a.value, a.nonce, a.deadline)
        );
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function submit(Approval memory a, uint8 v, bytes32 r, bytes32 s) internal {
        vm.prank(submitter);
        token.permit(a.owner, a.spender, a.value, a.deadline, v, r, s);
    }

    function signAndSubmit(Approval memory a) internal {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        submit(a, v, r, s);
    }

    function assertUnchanged() internal view {
        assertEq(token.nonces(issuers[0]), 0);
        assertEq(token.allowance(issuers[0], address(torna)), 0);
        assertEq(token.balanceOf(issuers[0]), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 0);
    }

    function testRelayerSubmitsForIssuerWithNoNativeGasAndNoApproveTransaction() public {
        vm.deal(issuers[0], 0);
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.expectEmit(true, true, false, true, address(token));
        emit IERC20.Approval(a.owner, a.spender, a.value);
        submit(a, v, r, s);
        assertEq(issuers[0].balance, 0);
        assertEq(token.allowance(a.owner, address(torna)), 3000e6);
        assertEq(token.allowance(a.owner, submitter), 0);
        assertEq(token.nonces(a.owner), 1);
        // Approval alone does not move collateral or mint anything.
        assertEq(token.balanceOf(a.owner), 10_000e6);
        assertEq(token.balanceOf(address(torna)), 0);
        assertEq(token.totalSupply(), 170_000e6);
    }

    function testDomainUsesTokenNameTokenAddressAndActualChain() public view {
        (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,,
        ) = token.eip712Domain();
        assertEq(fields, bytes1(0x0f));
        assertEq(name, "Torna Mock USDC");
        assertEq(version, "1");
        assertEq(chainId, block.chainid);
        assertEq(verifyingContract, address(token));
        assertEq(
            token.DOMAIN_SEPARATOR(),
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes(name)),
                    keccak256(bytes(version)),
                    chainId,
                    verifyingContract
                )
            )
        );
        assertEq(token.decimals(), 6);
    }

    function testReplayFailsWithoutChangingAllowanceOrNonce() public {
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        submit(a, v, r, s);
        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        submit(a, v, r, s);
        assertEq(token.nonces(a.owner), 1);
        assertEq(token.allowance(a.owner, a.spender), a.value);
    }

    function testExpiredPermitDoesNotConsumeNonceAndNewSignatureCanSucceed() public {
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.warp(a.deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(ERC20Permit.ERC2612ExpiredSignature.selector, a.deadline)
        );
        submit(a, v, r, s);
        assertUnchanged();
        signAndSubmit(approval());
        assertEq(token.nonces(a.owner), 1);
    }

    function testExactlyAtDeadlineIsAccepted() public {
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.warp(a.deadline);
        submit(a, v, r, s);
        assertEq(token.nonces(a.owner), 1);
    }

    function testEverySignedFieldIsBoundAndFailuresRollBackNonce() public {
        Approval memory original = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(original, token.DOMAIN_SEPARATOR()));
        for (uint256 field; field < 4; ++field) {
            Approval memory changed = approval();
            if (field == 0) changed.owner = issuers[1];
            if (field == 1) changed.spender = submitter;
            if (field == 2) changed.value += 1;
            if (field == 3) changed.deadline += 1;
            vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
            submit(changed, v, r, s);
            assertUnchanged();
            assertEq(token.nonces(issuers[1]), 0);
            assertEq(token.allowance(issuers[0], submitter), 0);
        }
        submit(original, v, r, s);
        assertEq(token.nonces(original.owner), 1);
    }

    function testFutureNonceIsRejected() public {
        Approval memory a = approval();
        a.nonce = 1;
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        submit(a, v, r, s);
        assertUnchanged();
    }

    function testWrongSignerCannotApproveIssuerTokens() public {
        Approval memory a = approval();
        (address attacker, uint256 attackerKey) = makeAddrAndKey("test-permit-attacker");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.expectRevert(
            abi.encodeWithSelector(ERC20Permit.ERC2612InvalidSigner.selector, attacker, a.owner)
        );
        submit(a, v, r, s);
        assertUnchanged();
    }

    function testMalformedSignatureIsRejectedWithoutConsumingNonce() public {
        Approval memory a = approval();
        vm.expectRevert(ECDSA.ECDSAInvalidSignature.selector);
        submit(a, 0, bytes32(0), bytes32(0));
        assertUnchanged();
    }

    function testAdvanceRequestSignatureCannotApproveTokens() public {
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, torna.hashAdvanceRequest(request()));
        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        submit(a, v, r, s);
        assertUnchanged();
    }

    function testWrongNameVersionAndTornaDomainAreRejected() public {
        Approval memory a = approval();
        bytes32[3] memory domains = [
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256("Torna"),
                    keccak256("1"),
                    block.chainid,
                    address(token)
                )
            ),
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256("Torna Mock USDC"),
                    keccak256("2"),
                    block.chainid,
                    address(token)
                )
            ),
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256("Torna"),
                    keccak256("1"),
                    block.chainid,
                    address(torna)
                )
            )
        ];
        for (uint256 i; i < domains.length; ++i) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, digest(a, domains[i]));
            vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
            submit(a, v, r, s);
            assertUnchanged();
        }
    }

    function testWrongChainFailsAndOriginalChainStillAcceptsSignature() public {
        Approval memory a = approval();
        bytes32 originalDomain = token.DOMAIN_SEPARATOR();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, digest(a, originalDomain));
        vm.chainId(31337);
        assertNotEq(token.DOMAIN_SEPARATOR(), originalDomain);
        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        submit(a, v, r, s);
        assertUnchanged();
        vm.chainId(10143);
        submit(a, v, r, s);
        assertEq(token.nonces(a.owner), 1);
    }

    function testSignatureCannotBeUsedOnAnotherToken() public {
        Approval memory a = approval();
        MockUSDC other = new MockUSDC(admin);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.prank(submitter);
        vm.expectPartialRevert(ERC20Permit.ERC2612InvalidSigner.selector);
        other.permit(a.owner, a.spender, a.value, a.deadline, v, r, s);
        assertEq(other.nonces(a.owner), 0);
        assertEq(other.allowance(a.owner, a.spender), 0);
        assertUnchanged();
    }

    function testPermitCanBeSubmittedByAnyoneButDoesNotAuthorizeThatCallerToSpend() public {
        Approval memory a = approval();
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.prank(lps[5]);
        token.permit(a.owner, a.spender, a.value, a.deadline, v, r, s);
        vm.prank(submitter);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, submitter, uint256(0), a.value
            )
        );
        token.transferFrom(a.owner, submitter, a.value);
        vm.prank(lps[5]);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, lps[5], uint256(0), a.value
            )
        );
        token.transferFrom(a.owner, lps[5], a.value);
        assertEq(token.allowance(a.owner, address(torna)), a.value);
        assertEq(token.balanceOf(a.owner), 10_000e6);
    }

    function testZeroSpenderRevertsWithoutConsumingNonce() public {
        Approval memory a = approval();
        a.spender = address(0);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(testIssuerKey, digest(a, token.DOMAIN_SEPARATOR()));
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InvalidSpender.selector, address(0))
        );
        submit(a, v, r, s);
        assertUnchanged();
    }

    function testNewPermitReplacesAllowanceAndZeroValueRevokesIt() public {
        signAndSubmit(approval());
        Approval memory a = approval();
        a.value = 1000e6;
        signAndSubmit(a);
        assertEq(token.allowance(a.owner, a.spender), 1000e6);
        a.nonce = token.nonces(a.owner);
        a.value = 0;
        signAndSubmit(a);
        assertEq(token.allowance(a.owner, a.spender), 0);
        assertEq(token.nonces(a.owner), 3);
    }

    function testNonceIsPerOwner() public {
        signAndSubmit(approval());
        assertEq(token.nonces(issuers[0]), 1);
        assertEq(token.nonces(issuers[1]), 0);
        (address second, uint256 key) = makeAddrAndKey("test-issuer-1");
        Approval memory a = Approval(second, address(torna), 600e6, 0, block.timestamp + 10 minutes);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest(a, token.DOMAIN_SEPARATOR()));
        submit(a, v, r, s);
        assertEq(token.nonces(second), 1);
        assertEq(token.nonces(issuers[0]), 1);
    }

    function testSpenderCanConsumeOnlyApprovedAmountEvenAfterPermitDeadline() public {
        PermitSpenderProbe probe = new PermitSpenderProbe();
        Approval memory a = approval();
        a.spender = address(probe);
        signAndSubmit(a);
        // Permit deadline limits signature submission, NOT allowance lifetime.
        vm.warp(a.deadline + 1);
        vm.prank(submitter);
        probe.pull(token, a.owner, a.value);
        assertEq(token.allowance(a.owner, a.spender), 0);
        assertEq(token.balanceOf(a.owner), 7000e6);
        assertEq(token.balanceOf(address(probe)), 3000e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector,
                address(probe),
                uint256(0),
                uint256(1)
            )
        );
        probe.pull(token, a.owner, 1);
    }

    function testFuzzPermitValueIsExact(uint128 value) public {
        Approval memory a = approval();
        a.value = value;
        signAndSubmit(a);
        assertEq(token.allowance(a.owner, a.spender), value);
        assertEq(token.nonces(a.owner), 1);
        assertEq(token.balanceOf(a.owner), 10_000e6);
    }
}
