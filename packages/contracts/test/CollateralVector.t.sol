// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { stdJson } from "forge-std/StdJson.sol";
import { ProtocolFixture } from "./ProtocolFixture.sol";
import { Torna } from "../src/Torna.sol";
import { CollateralDepositRequest } from "../src/TornaTypes.sol";

contract CollateralVectorTest is ProtocolFixture {
    using stdJson for string;

    function testMatchesViemCollateralActionVector() public {
        // Only public hashes are loaded; this is not an executable signed request.
        // forge-lint: disable-next-line(unsafe-cheatcode)
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/../../shared/abi/fixtures/collateral-deposit.json")
        );
        vm.chainId(json.readUint(".domain.chainId"));
        address fixedAddress = json.readAddress(".domain.verifyingContract");
        vm.etch(fixedAddress, address(torna).code);
        Torna fixedTorna = Torna(fixedAddress);
        CollateralDepositRequest memory req = CollateralDepositRequest({
            issuer: json.readAddress(".message.issuer"),
            amount: vm.parseUint(json.readString(".message.amount")),
            nonce: vm.parseUint(json.readString(".message.nonce")),
            deadline: vm.parseUint(json.readString(".message.deadline"))
        });
        assertEq(fixedTorna.COLLATERAL_DEPOSIT_TYPEHASH(), json.readBytes32(".expected.typeHash"));
        assertEq(fixedTorna.hashCollateralDeposit(req), json.readBytes32(".expected.digest"));
    }
}
