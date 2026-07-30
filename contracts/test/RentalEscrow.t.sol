// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

contract RentalEscrowTest is Test {
    MockUSDC usdc;
    RentalEscrow escrow;

    address owner = makeAddr("owner");
    address renter = makeAddr("renter");
    address treasury = makeAddr("treasury");
    address stranger = makeAddr("stranger");

    bytes32 constant LISTING_ID = keccak256("listing-uuid");
    uint256 constant RENT = 100e6; // 100 USDC
    uint256 constant DEPOSIT = 20e6; // 20 USDC
    uint256 constant RENTER_FUNDS = 1_000e6;
    uint64 startDate = 1_800_000_000;
    uint64 endDate = 1_800_259_200; // start + 3 days

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new RentalEscrow(IERC20(address(usdc)), treasury);

        usdc.mint(renter, RENTER_FUNDS);
        vm.prank(renter);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // Helpers -----------------------------------------------------------------

    function _request() internal returns (uint256 id) {
        vm.prank(renter);
        id = escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, startDate, endDate);
    }

    function _statusOf(uint256 id) internal view returns (RentalEscrow.Status) {
        (,,,,,,, RentalEscrow.Status status) = escrow.rentals(id);
        return status;
    }

    function _reachApproved() internal returns (uint256 id) {
        id = _request();
        vm.prank(owner);
        escrow.approveRental(id);
    }

    function _reachActive() internal returns (uint256 id) {
        id = _reachApproved();
        vm.prank(renter);
        escrow.checkIn(id);
    }

    function _reachReturned() internal returns (uint256 id) {
        id = _reachActive();
        vm.prank(owner);
        escrow.checkOut(id);
    }

    // Happy path --------------------------------------------------------------

    function test_HappyPath() public {
        uint256 fee = RENT / 100;
        uint256 ownerPayout = RENT - fee;

        // 1. Request: renter funds the escrow, nobody else has been paid.
        uint256 id = _request();
        assertEq(id, 1, "first id is 1");
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Requested));
        assertEq(usdc.balanceOf(renter), RENTER_FUNDS - RENT - DEPOSIT, "renter paid in");
        assertEq(usdc.balanceOf(address(escrow)), RENT + DEPOSIT, "escrow holds both");
        assertEq(usdc.balanceOf(owner), 0, "owner not paid yet");
        assertEq(usdc.balanceOf(treasury), 0, "no fee yet");

        // 2. Approve: price is agreed, money has not moved.
        vm.prank(owner);
        escrow.approveRental(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Approved));
        assertEq(usdc.balanceOf(address(escrow)), RENT + DEPOSIT, "still both in escrow");
        assertEq(usdc.balanceOf(owner), 0, "approve does not pay the owner");

        // 3. Check in: rent goes out, deposit stays.
        vm.prank(renter);
        escrow.checkIn(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Active));
        assertEq(usdc.balanceOf(owner), ownerPayout, "owner got rent minus fee");
        assertEq(usdc.balanceOf(treasury), fee, "treasury got the fee");
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "only deposit left");

        // 4. Check out: confirmation only, no money moves.
        vm.prank(owner);
        escrow.checkOut(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Returned));
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "deposit still held");

        // 5. Finalize: deposit back to the renter, escrow empty.
        escrow.finalize(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(usdc.balanceOf(renter), RENTER_FUNDS - RENT, "renter only lost the rent");
        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), RENT, "rent fully split"
        );
    }

    function test_FeeIsOnePercent() public {
        uint256 id = _reachApproved();
        vm.prank(renter);
        escrow.checkIn(id);

        assertEq(usdc.balanceOf(owner), 99e6, "owner keeps 99 of 100");
        assertEq(usdc.balanceOf(treasury), 1e6, "treasury takes 1 of 100");
    }

    function test_DepositReturnedInFull() public {
        uint256 id = _reachReturned();
        uint256 before = usdc.balanceOf(renter);

        escrow.finalize(id);

        assertEq(usdc.balanceOf(renter) - before, DEPOSIT, "deposit is not touched by fee");
    }

    function test_FinalizeIsPermissionless() public {
        uint256 id = _reachReturned();

        vm.prank(stranger);
        escrow.finalize(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(renter), RENTER_FUNDS - RENT, "deposit went to the renter");
    }

    function test_NoDustLeftOnOddRent() public {
        // 101 USDC and 1 wei of USDC both leave a remainder when split by 100.
        uint256 oddRent = 101e6 + 1;
        vm.prank(renter);
        uint256 id =
            escrow.requestRental(LISTING_ID, owner, oddRent, DEPOSIT, startDate, endDate);
        vm.prank(owner);
        escrow.approveRental(id);
        vm.prank(renter);
        escrow.checkIn(id);

        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), oddRent, "no rent stuck"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "escrow holds exactly deposit");
    }

    // Wrong caller ------------------------------------------------------------

    function test_OnlyOwnerCanApprove() public {
        uint256 id = _request();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.approveRental(id);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.approveRental(id);
    }

    function test_OnlyRenterCanCheckIn() public {
        uint256 id = _reachApproved();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotRenter.selector);
        escrow.checkIn(id);

        vm.prank(owner);
        vm.expectRevert(RentalEscrow.NotRenter.selector);
        escrow.checkIn(id);
    }

    function test_OnlyOwnerCanCheckOut() public {
        uint256 id = _reachActive();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.checkOut(id);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.checkOut(id);
    }

    // Wrong order -------------------------------------------------------------

    function test_CheckInBeforeApproveReverts() public {
        uint256 id = _request();

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Approved,
                RentalEscrow.Status.Requested
            )
        );
        escrow.checkIn(id);
    }

    function test_CheckOutBeforeCheckInReverts() public {
        uint256 id = _reachApproved();

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Active,
                RentalEscrow.Status.Approved
            )
        );
        escrow.checkOut(id);
    }

    function test_FinalizeBeforeCheckOutReverts() public {
        uint256 id = _reachActive();

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Returned,
                RentalEscrow.Status.Active
            )
        );
        escrow.finalize(id);
    }

    // Replay ------------------------------------------------------------------

    function test_CannotApproveTwice() public {
        uint256 id = _reachApproved();

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Requested,
                RentalEscrow.Status.Approved
            )
        );
        escrow.approveRental(id);
    }

    function test_CannotCheckInTwice() public {
        uint256 id = _reachActive();

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Approved,
                RentalEscrow.Status.Active
            )
        );
        escrow.checkIn(id);
    }

    function test_CannotFinalizeTwice() public {
        uint256 id = _reachReturned();
        escrow.finalize(id);

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Returned,
                RentalEscrow.Status.Completed
            )
        );
        escrow.finalize(id);
    }

    // Unknown id --------------------------------------------------------------

    function test_UnknownRentalReverts() public {
        uint256 ghost = 999;

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Requested,
                RentalEscrow.Status.None
            )
        );
        escrow.approveRental(ghost);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Approved,
                RentalEscrow.Status.None
            )
        );
        escrow.checkIn(ghost);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Active,
                RentalEscrow.Status.None
            )
        );
        escrow.checkOut(ghost);

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Returned,
                RentalEscrow.Status.None
            )
        );
        escrow.finalize(ghost);
    }

    // Bad input ---------------------------------------------------------------

    function test_RejectsZeroRent() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ZeroRent.selector);
        escrow.requestRental(LISTING_ID, owner, 0, DEPOSIT, startDate, endDate);
    }

    function test_RejectsEndBeforeStart() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.InvalidDates.selector);
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, endDate, startDate);
    }

    function test_RejectsZeroOwner() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        escrow.requestRental(LISTING_ID, address(0), RENT, DEPOSIT, startDate, endDate);
    }

    function test_RejectsRentingOwnItem() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.CannotRentOwnItem.selector);
        escrow.requestRental(LISTING_ID, renter, RENT, DEPOSIT, startDate, endDate);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(0)), treasury);

        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(usdc)), address(0));
    }

    // Funding failures --------------------------------------------------------

    function test_RevertsWithoutTokenApproval() public {
        address broke = makeAddr("noApproval");
        usdc.mint(broke, RENTER_FUNDS);

        vm.prank(broke);
        vm.expectRevert(); // ERC20InsufficientAllowance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, startDate, endDate);
    }

    function test_RevertsWithoutEnoughBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, RENT); // enough for rent, not for rent + deposit
        vm.startPrank(poor);
        usdc.approve(address(escrow), type(uint256).max);

        vm.expectRevert(); // ERC20InsufficientBalance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, startDate, endDate);
        vm.stopPrank();
    }

    // Ids ---------------------------------------------------------------------

    function test_IdsIncrement() public {
        uint256 first = _request();
        uint256 second = _request();

        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(escrow.nextRentalId(), 3);
    }
}
