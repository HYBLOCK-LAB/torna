// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { stdJson } from "forge-std/StdJson.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { AdvanceRequest } from "../src/TornaTypes.sol";

contract SharedVectorTest is ProtocolFixture {
    using stdJson for string;

    function testMatchesViemHashVector() public {
        // Only the committed public fixture directory has read permission in foundry.toml.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/../../shared/abi/fixtures/advance-request.json")
        );
        vm.chainId(json.readUint(".domain.chainId"));
        address vectorAddress = json.readAddress(".domain.verifyingContract");
        // Hash-only check at a fixed address. OpenZeppelin rebuilds its separator
        // because address(this) differs from the constructor's cached address.
        vm.etch(vectorAddress, address(torna).code);
        Torna vectorContract = Torna(vectorAddress);
        uint256 maturity = vm.parseUint(json.readString(".request.maturity"));
        assertLe(maturity, type(uint64).max);
        AdvanceRequest memory req = AdvanceRequest({
            refundKey: keccak256(bytes(json.readString(".refundId"))),
            issuer: json.readAddress(".request.issuer"),
            acquirerHash: keccak256(bytes(json.readString(".acquirerId"))),
            amount: vm.parseUint(json.readString(".request.amount")),
            maturity: SafeCast.toUint64(maturity),
            nonce: vm.parseUint(json.readString(".request.nonce")),
            deadline: vm.parseUint(json.readString(".request.deadline"))
        });
        assertEq(req.refundKey, json.readBytes32(".request.refundKey"));
        assertEq(req.acquirerHash, json.readBytes32(".request.acquirerHash"));
        assertEq(vectorContract.ADVANCE_REQUEST_TYPEHASH(), json.readBytes32(".expected.typeHash"));
        assertEq(vectorContract.hashAdvanceRequest(req), json.readBytes32(".expected.digest"));
    }
}
