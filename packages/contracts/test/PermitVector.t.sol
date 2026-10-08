// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { stdJson } from "forge-std/StdJson.sol";
import { ProtocolFixture } from "./ProtocolFixture.sol";
import { MockUSDC } from "../src/MockUSDC.sol";

contract PermitVectorTest is ProtocolFixture {
    using stdJson for string;

    function testMatchesSharedViemPermitVector() public {
        // Public hashes only, no private key or reusable authorization in the fixture.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/../../shared/abi/fixtures/permit.json")
        );
        vm.chainId(json.readUint(".domain.chainId"));
        address fixedAddress = json.readAddress(".domain.verifyingContract");
        // Hash-only probe: OZ rebuilds the separator for this test address.
        vm.etch(fixedAddress, address(token).code);
        bytes32 domain = MockUSDC(fixedAddress).DOMAIN_SEPARATOR();
        bytes32 typeHash = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(
                typeHash,
                json.readAddress(".message.owner"),
                json.readAddress(".message.spender"),
                vm.parseUint(json.readString(".message.value")),
                vm.parseUint(json.readString(".message.nonce")),
                vm.parseUint(json.readString(".message.deadline"))
            )
        );
        assertEq(typeHash, json.readBytes32(".expected.typeHash"));
        assertEq(structHash, json.readBytes32(".expected.structHash"));
        assertEq(domain, json.readBytes32(".expected.domainSeparator"));
        assertEq(
            keccak256(abi.encodePacked(hex"1901", domain, structHash)),
            json.readBytes32(".expected.digest")
        );
    }
}
