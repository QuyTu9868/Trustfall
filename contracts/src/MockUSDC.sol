// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test USDC for the Trustfall demo. Not real money, anyone can mint.
/// @dev ERC20Permit lets the frontend merge approve and rent into one wallet signature.
contract MockUSDC is ERC20, ERC20Permit {
    constructor() ERC20("Mock USDC", "USDC") ERC20Permit("Mock USDC") {}

    /// @dev Real USDC uses 6 decimals, so the demo matches it.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet so demo users can get test USDC without asking anyone.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
