// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { ProtocolFixture } from "./ProtocolFixture.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { InvalidAddress } from "../src/TornaTypes.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";

contract MockUSDCTest is ProtocolFixture {
    function testSixDecimalsAndMintedSupply() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.balanceOf(issuers[0]), 10_000e6);
        assertEq(token.balanceOf(lps[5]), 20_000e6);
        assertEq(token.totalSupply(), 170_000e6);
    }

    function testOnlyMinterCanMint() public {
        bytes32 minterRole = token.MINTER_ROLE();
        vm.prank(issuers[0]);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, issuers[0], minterRole
            )
        );
        token.mint(issuers[0], 1000e6);
    }

    function testRejectsZeroAdmin() public {
        vm.expectRevert(InvalidAddress.selector);
        new MockUSDC(address(0));
    }

    function testTransferFromConsumesAllowanceAndConservesSupply() public {
        vm.prank(lps[0]);
        assertTrue(token.approve(submitter, 1000e6));
        vm.prank(submitter);
        assertTrue(token.transferFrom(lps[0], issuers[0], 1000e6));
        assertEq(token.balanceOf(lps[0]), 19_000e6);
        assertEq(token.balanceOf(issuers[0]), 11_000e6);
        assertEq(token.allowance(lps[0], submitter), 0);
        assertEq(token.totalSupply(), 170_000e6);
    }
}
