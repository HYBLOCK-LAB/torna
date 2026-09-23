// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { stdJson } from "forge-std/StdJson.sol";
import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { RepaymentRequest } from "../src/TornaTypes.sol";

contract RepaymentVectorTest is ProtocolFixture {
    using stdJson for string;

    function testMatchesViemRepaymentActionVector() public {
        // Only public hashes are loaded; this is not an executable signed request.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/../../shared/abi/fixtures/repayment-request.json")
        );
        vm.chainId(json.readUint(".domain.chainId"));
        address fixedAddress = json.readAddress(".domain.verifyingContract");
        vm.etch(fixedAddress, address(torna).code);
        Torna fixedTorna = Torna(fixedAddress);
        RepaymentRequest memory request = RepaymentRequest({
            refundKey: json.readBytes32(".message.refundKey"),
            issuer: json.readAddress(".message.issuer"),
            amount: vm.parseUint(json.readString(".message.amount")),
            nonce: vm.parseUint(json.readString(".message.nonce")),
            deadline: vm.parseUint(json.readString(".message.deadline"))
        });
        assertEq(fixedTorna.REPAYMENT_REQUEST_TYPEHASH(), json.readBytes32(".expected.typeHash"));
        assertEq(fixedTorna.hashRepaymentRequest(request), json.readBytes32(".expected.digest"));
    }
}
