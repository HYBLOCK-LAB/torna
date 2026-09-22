// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Torna } from "../src/Torna.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { AdvanceRequest } from "../src/TornaTypes.sol";

abstract contract ProtocolFixture is Test {
    Torna internal torna;
    MockUSDC internal token;
    address internal admin;
    address internal verifier;
    address internal submitter;
    address[5] internal issuers;
    address[6] internal lps;
    uint256 internal testIssuerKey;

    function setUp() public virtual {
        vm.chainId(10143);
        admin = makeAddr("test-admin");
        verifier = makeAddr("test-verifier");
        submitter = makeAddr("test-submitter");
        // Synthetic test-only identities; no real wallet is loaded or derived.
        for (uint256 i; i < issuers.length; ++i) {
            (address actor, uint256 key) =
                makeAddrAndKey(string.concat("test-issuer-", vm.toString(i)));
            issuers[i] = actor;
            if (i == 0) testIssuerKey = key;
        }
        for (uint256 i; i < lps.length; ++i) {
            lps[i] = makeAddr(string.concat("test-lp-", vm.toString(i)));
        }
        token = new MockUSDC(admin);
        torna = new Torna(token, admin, verifier, submitter);
        vm.startPrank(admin);
        for (uint256 i; i < issuers.length; ++i) {
            token.mint(issuers[i], 10_000e6);
        }
        for (uint256 i; i < lps.length; ++i) {
            token.mint(lps[i], 20_000e6);
        }
        vm.stopPrank();
    }

    function request() internal view returns (AdvanceRequest memory) {
        return AdvanceRequest({
            refundKey: keccak256(bytes("REF-2026-001")),
            issuer: issuers[0],
            acquirerHash: keccak256(bytes(unicode"ACQ-α")),
            amount: 1000e6,
            maturity: SafeCast.toUint64(block.timestamp + 5 days),
            nonce: 0,
            deadline: block.timestamp + 10 minutes
        });
    }

    function sign(AdvanceRequest memory req) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(testIssuerKey, torna.hashAdvanceRequest(req));
        return abi.encodePacked(r, s, v);
    }
}
