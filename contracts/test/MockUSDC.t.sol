// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC usdc;
    address alice = makeAddr("alice");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_DecimalsMatchRealUsdc() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_MintIncreasesBalance() public {
        usdc.mint(alice, 100e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.totalSupply(), 100e6);
    }

    function test_PermitDomainIsSet() public view {
        assertEq(usdc.nonces(alice), 0);
        assertTrue(usdc.DOMAIN_SEPARATOR() != bytes32(0));
    }
}
