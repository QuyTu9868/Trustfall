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
    address renter2 = makeAddr("renter2");
    address treasury = makeAddr("treasury");
    address stranger = makeAddr("stranger");

    bytes32 constant LISTING_ID = keccak256("listing-uuid");
    bytes32 constant OTHER_LISTING = keccak256("other-listing");
    uint256 constant RENT = 100e6; // 100 USDC
    uint256 constant DEPOSIT = 20e6; // 20 USDC
    uint256 constant FUNDS = 1_000e6;

    // A 3 day rental: day numbers 20833, 20834, 20835.
    uint64 constant START = 1_800_000_000;
    uint64 constant END = START + 2 days;

    function setUp() public {
        // Move the clock to just before the rental starts, so END is in the future.
        vm.warp(START - 1 days);

        usdc = new MockUSDC();
        escrow = new RentalEscrow(IERC20(address(usdc)), treasury);

        address[2] memory renters = [renter, renter2];
        for (uint256 i = 0; i < renters.length; i++) {
            usdc.mint(renters[i], FUNDS);
            vm.prank(renters[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    // Helpers -----------------------------------------------------------------

    function _request() internal returns (uint256 id) {
        return _requestAs(renter, LISTING_ID, START, END);
    }

    function _requestAs(address who, bytes32 listing, uint64 start, uint64 end)
        internal
        returns (uint256 id)
    {
        vm.prank(who);
        id = escrow.requestRental(listing, owner, RENT, DEPOSIT, start, end);
    }

    function _statusOf(uint256 id) internal view returns (RentalEscrow.Status) {
        (,,,,,,,, RentalEscrow.Status status) = escrow.rentals(id);
        return status;
    }

    function _returnedAtOf(uint256 id) internal view returns (uint64) {
        (,,,,,,, uint64 returnedAt,) = escrow.rentals(id);
        return returnedAt;
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

    /// @dev Jump to the first second the deposit may be released.
    function _warpToRelease(uint64 from) internal {
        vm.warp(from + escrow.DISPUTE_WINDOW());
    }

    function _day(uint64 timestamp) internal pure returns (uint256) {
        return uint256(timestamp) / 1 days;
    }

    // Happy path --------------------------------------------------------------

    function test_HappyPath() public {
        uint256 fee = RENT / 100;
        uint256 ownerPayout = RENT - fee;

        // 1. Request: renter funds the escrow, nobody else has been paid.
        uint256 id = _request();
        assertEq(id, 1, "first id is 1");
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Requested));
        assertEq(usdc.balanceOf(renter), FUNDS - RENT - DEPOSIT, "renter paid in");
        assertEq(usdc.balanceOf(address(escrow)), RENT + DEPOSIT, "escrow holds both");
        assertEq(usdc.balanceOf(owner), 0, "owner not paid yet");
        assertEq(usdc.balanceOf(treasury), 0, "no fee yet");

        // 2. Approve: price is agreed, calendar claimed, money has not moved.
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

        // 4. Check out: confirmation only, no money moves, window starts.
        vm.warp(END);
        vm.prank(owner);
        escrow.checkOut(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Returned));
        assertEq(_returnedAtOf(id), END, "returnedAt recorded");
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "deposit still held");

        // 5. Finalize once the window passed: deposit back, escrow empty.
        _warpToRelease(END);
        escrow.finalize(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "renter only lost the rent");
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

        _warpToRelease(_returnedAtOf(id));
        escrow.finalize(id);

        assertEq(usdc.balanceOf(renter) - before, DEPOSIT, "deposit untouched by fee");
    }

    function test_FinalizeIsPermissionless() public {
        uint256 id = _reachReturned();
        _warpToRelease(_returnedAtOf(id));

        vm.prank(stranger);
        escrow.finalize(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "deposit went to the renter");
    }

    function test_NoDustLeftOnOddRent() public {
        // 101.000001 USDC does not divide by 100 cleanly.
        uint256 oddRent = 101e6 + 1;
        vm.prank(renter);
        uint256 id = escrow.requestRental(LISTING_ID, owner, oddRent, DEPOSIT, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        vm.prank(renter);
        escrow.checkIn(id);

        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), oddRent, "no rent stuck"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "escrow holds exactly deposit");
    }

    // Calendar ----------------------------------------------------------------

    function test_ApproveMarksEveryDay() public {
        uint256 id = _reachApproved();

        for (uint256 day = _day(START); day <= _day(END); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), id, "day booked by this rental");
        }
        assertEq(escrow.bookedDay(LISTING_ID, _day(START) - 1), 0, "day before is free");
        assertEq(escrow.bookedDay(LISTING_ID, _day(END) + 1), 0, "day after is free");
    }

    function test_RequestDoesNotTouchCalendar() public {
        _request();

        assertEq(escrow.bookedDay(LISTING_ID, _day(START)), 0, "requesting books nothing");
    }

    function test_CannotApproveExactOverlap() public {
        _reachApproved();
        uint256 second = _requestAs(renter2, LISTING_ID, START, END);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.DayNotAvailable.selector, _day(START), 1)
        );
        escrow.approveRental(second);
    }

    function test_CannotApprovePartialOverlap() public {
        _reachApproved(); // holds days START..END
        // Starts on the last day of the first rental.
        uint256 second = _requestAs(renter2, LISTING_ID, END, END + 2 days);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.DayNotAvailable.selector, _day(END), 1)
        );
        escrow.approveRental(second);
    }

    function test_AdjacentDaysAreNotOverlap() public {
        _reachApproved();
        // Starts the day after the first rental ends.
        uint256 second = _requestAs(renter2, LISTING_ID, END + 1 days, END + 2 days);

        vm.prank(owner);
        escrow.approveRental(second);

        assertEq(uint256(_statusOf(second)), uint256(RentalEscrow.Status.Approved));
        assertEq(escrow.bookedDay(LISTING_ID, _day(END) + 1), second, "next day is theirs");
    }

    function test_SameDatesOnDifferentListingsAreFine() public {
        _reachApproved();
        uint256 second = _requestAs(renter2, OTHER_LISTING, START, END);

        vm.prank(owner);
        escrow.approveRental(second);

        assertEq(uint256(_statusOf(second)), uint256(RentalEscrow.Status.Approved));
    }

    function test_OverlappingRequestsCoexistUntilOneIsApproved() public {
        uint256 first = _request();
        uint256 second = _requestAs(renter2, LISTING_ID, START, END);

        // Both requests exist side by side, both funded.
        assertEq(uint256(_statusOf(first)), uint256(RentalEscrow.Status.Requested));
        assertEq(uint256(_statusOf(second)), uint256(RentalEscrow.Status.Requested));
        assertEq(usdc.balanceOf(address(escrow)), 2 * (RENT + DEPOSIT));

        vm.prank(owner);
        escrow.approveRental(second);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.DayNotAvailable.selector, _day(START), second
            )
        );
        escrow.approveRental(first);

        // The loser gets everything back by cancelling.
        vm.prank(renter);
        escrow.cancel(first);
        assertEq(usdc.balanceOf(renter), FUNDS, "loser is made whole");
    }

    function test_AcceptsExactlyMaxDays() public {
        uint64 end = START + (uint64(escrow.MAX_RENTAL_DAYS()) - 1) * 1 days;
        uint256 id = _requestAs(renter, LISTING_ID, START, end);

        assertEq(escrow.dayCount(START, end), escrow.MAX_RENTAL_DAYS());

        // Approving is the gas bounded step: one storage write per day. The whole
        // point of MAX_RENTAL_DAYS is that this call still fits comfortably in a
        // block, so measure it rather than assume.
        uint256 gasBefore = gasleft();
        vm.prank(owner);
        escrow.approveRental(id);
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Approved));
        assertLt(gasUsed, 1_000_000, "a max length approve must stay well under a block");
        emit log_named_uint("gas to approve a 30 day rental", gasUsed);

        // Every one of the 30 days is claimed.
        for (uint256 day = _day(START); day <= _day(end); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), id, "day booked");
        }
    }

    function test_RejectsRentalLongerThanMax() public {
        uint64 end = START + uint64(escrow.MAX_RENTAL_DAYS()) * 1 days;

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.RentalTooLong.selector,
                escrow.MAX_RENTAL_DAYS() + 1,
                escrow.MAX_RENTAL_DAYS()
            )
        );
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, START, end);
    }

    function test_RejectsRentalAlreadyOver() public {
        vm.warp(END + 1 days);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.RentalAlreadyOver.selector);
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, START, END);
    }

    function test_SingleDayRentalCountsAsOne() public view {
        assertEq(escrow.dayCount(START, START), 1);
    }

    // Cancel ------------------------------------------------------------------

    function test_RenterCancelsBeforeApproveGetsEverythingBack() public {
        uint256 id = _request();

        vm.prank(renter);
        escrow.cancel(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Cancelled));
        assertEq(usdc.balanceOf(renter), FUNDS, "full refund");
        assertEq(usdc.balanceOf(owner), 0, "owner gets nothing");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_OwnerRejectingRequestRefundsInFull() public {
        uint256 id = _request();

        vm.prank(owner);
        escrow.cancel(id);

        assertEq(usdc.balanceOf(renter), FUNDS, "full refund");
        assertEq(usdc.balanceOf(owner), 0, "rejecting earns nothing");
    }

    function test_RenterCancelsAfterApprovePaysTenPercentToOwner() public {
        uint256 id = _reachApproved();
        uint256 penalty = RENT / 10;

        vm.prank(renter);
        escrow.cancel(id);

        assertEq(usdc.balanceOf(owner), penalty, "owner compensated 10 percent of rent");
        assertEq(usdc.balanceOf(treasury), 0, "platform takes nothing on a cancel");
        assertEq(usdc.balanceOf(renter), FUNDS - penalty, "renter lost only the penalty");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_OwnerCancelsAfterApproveCostsRenterNothing() public {
        uint256 id = _reachApproved();

        vm.prank(owner);
        escrow.cancel(id);

        assertEq(usdc.balanceOf(renter), FUNDS, "renter made whole");
        assertEq(usdc.balanceOf(owner), 0, "owner earns nothing for backing out");
    }

    function test_CancelAfterApproveFreesTheDays() public {
        uint256 first = _reachApproved();

        vm.prank(renter);
        escrow.cancel(first);

        for (uint256 day = _day(START); day <= _day(END); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), 0, "day freed");
        }

        // Someone else can now take the same dates.
        uint256 second = _requestAs(renter2, LISTING_ID, START, END);
        vm.prank(owner);
        escrow.approveRental(second);
        assertEq(escrow.bookedDay(LISTING_ID, _day(START)), second, "relet worked");
    }

    function test_StrangerCannotCancel() public {
        uint256 id = _request();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.cancel(id);
    }

    function test_CannotCancelAfterCheckIn() public {
        uint256 id = _reachActive();

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.NotCancellable.selector, RentalEscrow.Status.Active
            )
        );
        escrow.cancel(id);
    }

    function test_CannotCancelTwice() public {
        uint256 id = _request();
        vm.prank(renter);
        escrow.cancel(id);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.NotCancellable.selector, RentalEscrow.Status.Cancelled
            )
        );
        escrow.cancel(id);
    }

    function test_CannotCancelUnknownRental() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.cancel(999);
    }

    // Timeout -----------------------------------------------------------------

    function test_FinalizeTooEarlyAfterCheckOut() public {
        uint256 id = _reachReturned();
        uint64 releaseAt = _returnedAtOf(id) + escrow.DISPUTE_WINDOW();

        vm.warp(releaseAt - 1);
        vm.expectRevert(abi.encodeWithSelector(RentalEscrow.TooEarly.selector, releaseAt));
        escrow.finalize(id);
    }

    function test_FinalizeAtExactlyTheDeadlineWorks() public {
        uint256 id = _reachReturned();

        _warpToRelease(_returnedAtOf(id));
        escrow.finalize(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
    }

    function test_OwnerNeverChecksOutDepositStillReleases() public {
        uint256 id = _reachActive();

        // Nobody calls checkOut. Once the rental ended plus the window, anyone can
        // release the deposit, so it is not stuck forever.
        _warpToRelease(END);
        vm.prank(stranger);
        escrow.finalize(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "deposit returned");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_FinalizeFromActiveTooEarly() public {
        uint256 id = _reachActive();
        uint64 releaseAt = END + escrow.DISPUTE_WINDOW();

        vm.warp(releaseAt - 1);
        vm.expectRevert(abi.encodeWithSelector(RentalEscrow.TooEarly.selector, releaseAt));
        escrow.finalize(id);
    }

    function test_CheckOutLateStartsWindowFromCheckOut() public {
        uint256 id = _reachActive();

        // Owner confirms the return 10 days after the rental ended. The window runs
        // from the confirmation, not from endDate, so it is not already expired.
        uint64 lateReturn = END + 10 days;
        vm.warp(lateReturn);
        vm.prank(owner);
        escrow.checkOut(id);

        vm.warp(lateReturn + escrow.DISPUTE_WINDOW() - 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.TooEarly.selector, lateReturn + escrow.DISPUTE_WINDOW()
            )
        );
        escrow.finalize(id);

        _warpToRelease(lateReturn);
        escrow.finalize(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
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

    function test_FinalizeBeforeCheckInReverts() public {
        uint256 id = _reachApproved();

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.NotFinalizable.selector, RentalEscrow.Status.Approved
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
        _warpToRelease(_returnedAtOf(id));
        escrow.finalize(id);

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.NotFinalizable.selector, RentalEscrow.Status.Completed
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
                RentalEscrow.NotFinalizable.selector, RentalEscrow.Status.None
            )
        );
        escrow.finalize(ghost);
    }

    // Bad input ---------------------------------------------------------------

    function test_RejectsZeroRent() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ZeroRent.selector);
        escrow.requestRental(LISTING_ID, owner, 0, DEPOSIT, START, END);
    }

    function test_RejectsEndBeforeStart() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.InvalidDates.selector);
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, END, START);
    }

    function test_RejectsZeroOwner() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        escrow.requestRental(LISTING_ID, address(0), RENT, DEPOSIT, START, END);
    }

    function test_RejectsRentingOwnItem() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.CannotRentOwnItem.selector);
        escrow.requestRental(LISTING_ID, renter, RENT, DEPOSIT, START, END);
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
        usdc.mint(broke, FUNDS);

        vm.prank(broke);
        vm.expectRevert(); // ERC20InsufficientAllowance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, START, END);
    }

    function test_RevertsWithoutEnoughBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, RENT); // enough for rent, not for rent + deposit
        vm.startPrank(poor);
        usdc.approve(address(escrow), type(uint256).max);

        vm.expectRevert(); // ERC20InsufficientBalance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, RENT, DEPOSIT, START, END);
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
