// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {RentalEscrow} from "../src/RentalEscrow.sol";

contract RentalEscrowTest is Test {
    MockUSDC usdc;
    RentalEscrow escrow;

    address owner;
    uint256 ownerKey;
    address renter;
    uint256 renterKey;
    address renter2;
    uint256 renter2Key;
    address stranger;
    uint256 strangerKey;

    address agent = makeAddr("agent");
    address admin = makeAddr("admin");
    address treasury = makeAddr("treasury");

    // Redeclared rather than imported: if someone edits the string in the contract,
    // these stop matching and the signature tests go red.
    bytes32 constant CHECK_IN_TYPEHASH =
        keccak256("CheckIn(uint256 rentalId,uint256 nonce,uint256 deadline)");
    bytes32 constant CHECK_OUT_TYPEHASH =
        keccak256("CheckOut(uint256 rentalId,uint256 nonce,uint256 deadline)");

    bytes32 constant LISTING_ID = keccak256("listing-uuid");
    bytes32 constant OTHER_LISTING = keccak256("other-listing");
    uint256 constant PRICE_PER_DAY = 50e6; // 50 USDC a day
    uint256 constant DEPOSIT = 20e6; // 20 USDC
    uint256 constant FUNDS = 5_000e6;

    // START to END books two nights, so the escrow holds two days of rent as the most
    // this rental can cost. What is actually charged depends on the clock.
    uint64 constant START = 1_800_000_000;
    uint64 constant END = START + 2 days;
    uint256 constant RENT = PRICE_PER_DAY * 2;

    function setUp() public {
        // Move the clock to just before the rental starts, so END is in the future.
        vm.warp(START - 1 days);

        (owner, ownerKey) = makeAddrAndKey("owner");
        (renter, renterKey) = makeAddrAndKey("renter");
        (renter2, renter2Key) = makeAddrAndKey("renter2");
        (stranger, strangerKey) = makeAddrAndKey("stranger");

        usdc = new MockUSDC();
        escrow = new RentalEscrow(IERC20(address(usdc)), treasury, agent, admin);

        address[2] memory renters = [renter, renter2];
        for (uint256 i = 0; i < renters.length; i++) {
            usdc.mint(renters[i], FUNDS);
            vm.prank(renters[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    // Signature helpers -------------------------------------------------------

    /// @dev Rebuilt from the contract's ERC-5267 output rather than hardcoded, so this
    ///      also proves the domain is wired up the way the frontend will expect.
    function _domainSeparator() internal view returns (bytes32) {
        (
            ,
            string memory name,
            string memory version,
            uint256 chainId,
            address verifyingContract,
            ,
        ) = escrow.eip712Domain();

        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );
    }

    function _sign(bytes32 typeHash, uint256 id, uint256 deadline, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        return _signWithNonce(typeHash, id, escrow.rentalNonce(id), deadline, key);
    }

    function _signWithNonce(
        bytes32 typeHash,
        uint256 id,
        uint256 nonce,
        uint256 deadline,
        uint256 key
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(typeHash, id, nonce, deadline));
        bytes32 digest =
            keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _soon() internal view returns (uint256) {
        return block.timestamp + 10 minutes;
    }

    // Flow helpers ------------------------------------------------------------

    function _request() internal returns (uint256 id) {
        return _requestAs(renter, LISTING_ID, START, END);
    }

    function _requestAs(address who, bytes32 listing, uint64 start, uint64 end)
        internal
        returns (uint256 id)
    {
        vm.prank(who);
        id = escrow.requestRental(listing, owner, PRICE_PER_DAY, DEPOSIT, start, end);
    }

    function _statusOf(uint256 id) internal view returns (RentalEscrow.Status) {
        (,,,,,,,,,,, RentalEscrow.Status status) = escrow.rentals(id);
        return status;
    }

    function _returnedAtOf(uint256 id) internal view returns (uint64) {
        (,,,,,,,,, uint64 returnedAt,,) = escrow.rentals(id);
        return returnedAt;
    }

    function _checkedInAtOf(uint256 id) internal view returns (uint64) {
        (,,,,,,,, uint64 checkedInAt,,,) = escrow.rentals(id);
        return checkedInAt;
    }

    function _disputedAtOf(uint256 id) internal view returns (uint64) {
        (,,,,,,,,,, uint64 disputedAt,) = escrow.rentals(id);
        return disputedAt;
    }

    function _reachApproved() internal returns (uint256 id) {
        id = _request();
        vm.prank(owner);
        escrow.approveRental(id);
    }

    function _checkIn(uint256 id) internal {
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);
        vm.prank(renter);
        escrow.checkIn(id, deadline, sig);
    }

    function _checkOut(uint256 id) internal {
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_OUT_TYPEHASH, id, deadline, renterKey);
        vm.prank(owner);
        escrow.checkOut(id, deadline, sig);
    }

    function _reachActive() internal returns (uint256 id) {
        id = _reachApproved();
        _checkIn(id);
    }

    function _reachReturned() internal returns (uint256 id) {
        id = _reachActive();
        // Hold it for the whole booking, so settlement charges the full amount and the
        // balances in these tests are about the deposit rather than a rent refund.
        // The partial use cases get their own tests further down.
        vm.warp(block.timestamp + 2 days);
        _checkOut(id);
    }

    function _reachDisputed() internal returns (uint256 id) {
        id = _reachReturned();
        vm.prank(owner);
        escrow.openDispute(id);
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

        // 3. Check in with the owner's signed QR. Nothing is paid out: the 24 hour clock
        //    has only just started, so nobody yet knows what this rental will cost.
        _checkIn(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Active));
        assertEq(_checkedInAtOf(id), uint64(block.timestamp), "clock started");
        assertEq(usdc.balanceOf(owner), 0, "check-in pays nobody now");
        assertEq(usdc.balanceOf(treasury), 0, "no fee yet either");
        assertEq(usdc.balanceOf(address(escrow)), RENT + DEPOSIT, "rent still escrowed");

        // 4. Check out with the renter's signed QR, after using the full two days. The
        //    clock stops, the rent is worked out, and the deposit stays for the window.
        vm.warp(block.timestamp + 2 days);
        _checkOut(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Returned));
        assertEq(usdc.balanceOf(owner), ownerPayout, "owner got rent minus fee");
        assertEq(usdc.balanceOf(treasury), fee, "treasury got the fee");
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "only deposit left");

        // 5. Finalize once the window passed: deposit back, escrow empty.
        _warpToRelease(_returnedAtOf(id));
        escrow.finalize(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "renter only lost the rent");
        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), RENT, "rent fully split"
        );
    }

    function test_FeeIsOnePercent() public {
        // Two days at 50 USDC, used in full, so 100 USDC of rent is settled.
        _reachReturned();

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

    // The 24 hour clock ------------------------------------------------------

    /// @dev Runs a rental, holds the item for `heldFor`, and reports what was charged.
    function _chargeAfterHolding(uint256 heldFor) internal returns (uint256 charged) {
        uint256 id = _reachActive();
        vm.warp(block.timestamp + heldFor);
        _checkOut(id);
        return usdc.balanceOf(owner) + usdc.balanceOf(treasury);
    }

    function test_ChargesOneDayForAnythingUnderTwentyFourHours() public {
        // Handed back after an hour. Still a day: an item taken off the shelf and
        // returned is not free, which is how every hire desk in the world works.
        assertEq(_chargeAfterHolding(1 hours), PRICE_PER_DAY, "one day minimum");
    }

    function test_ExactlyTwentyFourHoursIsOneDay() public {
        assertEq(_chargeAfterHolding(24 hours), PRICE_PER_DAY, "24h on the nose is one");
    }

    function test_OneSecondPastTwentyFourHoursIsTwoDays() public {
        // The boundary that decides the price, so it gets its own test.
        assertEq(
            _chargeAfterHolding(24 hours + 1), PRICE_PER_DAY * 2, "started day is a day"
        );
    }

    function test_ChargeIsCappedAtTheDaysBooked() public {
        // Booked two days, kept it five. The contract only holds two days of rent and
        // cannot reach into the renter's wallet for the rest, so it charges two. Getting
        // paid for the overstay is what the deposit and the dispute flow are for.
        assertEq(_chargeAfterHolding(5 days), RENT, "never more than was booked");
    }

    function test_UnusedDaysComeBackToTheRenter() public {
        uint256 id = _reachActive();
        uint256 afterPaying = usdc.balanceOf(renter);

        vm.warp(block.timestamp + 2 hours);
        _checkOut(id);

        // Paid for two days up front, used one, so one day comes straight back.
        assertEq(
            usdc.balanceOf(renter) - afterPaying, PRICE_PER_DAY, "one day refunded"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "only the deposit is left");
    }

    function test_OwnerWhoNeverChecksOutIsPaidTheFullBooking() public {
        uint256 id = _reachActive();

        // Nobody confirms the return. Once the timeout passes, anyone can close it: the
        // renter had the item the whole time, so the full booking is charged, and the
        // deposit still goes back because nobody complained.
        _warpToRelease(END);
        vm.prank(stranger);
        escrow.finalize(id);

        assertEq(usdc.balanceOf(owner) + usdc.balanceOf(treasury), RENT, "full booking");
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "deposit back, rent paid");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_DisputeFromActiveSettlesTheRentToo() public {
        uint256 id = _reachActive();
        vm.warp(block.timestamp + 1 hours);

        vm.prank(owner);
        escrow.openDispute(id);

        // The verdict only ever moves the deposit, so the rent has to be settled on the
        // way in or it would be stranded in the contract for good.
        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), PRICE_PER_DAY, "one day"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "only the deposit is disputed");
    }

    function test_NoDustLeftOnOddRent() public {
        // A day rate that does not divide by 100 cleanly, so the 1% fee has a remainder.
        uint256 oddRate = 101e6 + 1;
        vm.prank(renter);
        uint256 id =
            escrow.requestRental(LISTING_ID, owner, oddRate, DEPOSIT, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        _checkIn(id);
        vm.warp(block.timestamp + 2 days);
        _checkOut(id);

        uint256 charged = oddRate * 2;
        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), charged, "no rent stuck"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "escrow holds exactly deposit");
    }

    // QR signatures -----------------------------------------------------------

    function test_CheckInNeedsTheOwnerSignature() public {
        uint256 id = _reachApproved();
        uint256 deadline = _soon();
        // Renter signs their own permission slip.
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, renterKey);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.BadSignature.selector, owner, renter)
        );
        escrow.checkIn(id, deadline, sig);
    }

    function test_CheckOutNeedsTheRenterSignature() public {
        uint256 id = _reachActive();
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_OUT_TYPEHASH, id, deadline, ownerKey);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.BadSignature.selector, renter, owner)
        );
        escrow.checkOut(id, deadline, sig);
    }

    function test_ExpiredSignatureRejected() public {
        uint256 id = _reachApproved();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        // A photo of yesterday's QR code is worthless.
        vm.warp(deadline + 1);
        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.SignatureExpired.selector, deadline)
        );
        escrow.checkIn(id, deadline, sig);
    }

    function test_SignatureAtExactlyTheDeadlineStillWorks() public {
        uint256 id = _reachApproved();
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        vm.warp(deadline);
        vm.prank(renter);
        escrow.checkIn(id, deadline, sig);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Active));
    }

    function test_BumpNonceKillsAnOutstandingCode() public {
        uint256 id = _reachApproved();
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        // Owner showed the code then changed their mind.
        vm.prank(owner);
        escrow.bumpNonce(id);
        assertEq(escrow.rentalNonce(id), 1, "nonce moved");

        vm.prank(renter);
        vm.expectRevert(); // recovers to some other address, so BadSignature
        escrow.checkIn(id, deadline, sig);

        // A freshly signed code still works.
        _checkIn(id);
        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Active));
    }

    function test_EitherPartyCanBumpNonce() public {
        uint256 id = _reachApproved();

        vm.prank(renter);
        escrow.bumpNonce(id);
        vm.prank(owner);
        escrow.bumpNonce(id);

        assertEq(escrow.rentalNonce(id), 2);
    }

    function test_StrangerCannotBumpNonce() public {
        uint256 id = _reachApproved();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.bumpNonce(id);
    }

    function test_CheckInSignatureCannotBeReplayedAsCheckOut() public {
        uint256 id = _reachApproved();
        uint256 deadline = _soon();
        // The owner's check-in code, aimed at check-out. Different type name means a
        // different digest, so it recovers to the wrong address.
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);
        _checkIn(id);

        vm.prank(owner);
        vm.expectRevert();
        escrow.checkOut(id, deadline, sig);
    }

    function test_SignatureFromAnotherRentalRejected() public {
        uint256 first = _reachApproved();
        uint256 second = _requestAs(renter, LISTING_ID, END + 1 days, END + 2 days);
        vm.prank(owner);
        escrow.approveRental(second);

        uint256 deadline = _soon();
        bytes memory sigForFirst = _sign(CHECK_IN_TYPEHASH, first, deadline, ownerKey);

        vm.prank(renter);
        vm.expectRevert();
        escrow.checkIn(second, deadline, sigForFirst);
    }

    function test_GarbageSignatureRejected() public {
        uint256 id = _reachApproved();
        uint256 deadline = _soon();

        vm.prank(renter);
        vm.expectRevert();
        escrow.checkIn(id, deadline, hex"deadbeef");
    }

    // Disputes ----------------------------------------------------------------

    function test_OwnerCanDisputeAfterCheckOut() public {
        uint256 id = _reachReturned();

        vm.prank(owner);
        escrow.openDispute(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Disputed));
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "deposit still held");
    }

    function test_RenterCanDisputeWhileActive() public {
        uint256 id = _reachActive();

        vm.prank(renter);
        escrow.openDispute(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Disputed));
    }

    function test_StrangerCannotOpenDispute() public {
        uint256 id = _reachReturned();

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotParty.selector);
        escrow.openDispute(id);
    }

    function test_CannotDisputeAfterTheWindowClosed() public {
        uint256 id = _reachReturned();
        uint64 deadline = _returnedAtOf(id) + escrow.DISPUTE_WINDOW();

        _warpToRelease(_returnedAtOf(id));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(RentalEscrow.TooLate.selector, deadline));
        escrow.openDispute(id);
    }

    function test_CannotDisputeBeforeCheckIn() public {
        uint256 id = _reachApproved();

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.CannotDispute.selector, RentalEscrow.Status.Approved
            )
        );
        escrow.openDispute(id);
    }

    function test_CannotDisputeAfterCompleted() public {
        uint256 id = _reachReturned();
        _warpToRelease(_returnedAtOf(id));
        escrow.finalize(id);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.CannotDispute.selector, RentalEscrow.Status.Completed
            )
        );
        escrow.openDispute(id);
    }

    function test_FinalizeBlockedWhileVerdictWindowIsOpen() public {
        uint256 id = _reachDisputed();
        uint64 releaseAt = _disputedAtOf(id) + escrow.VERDICT_WINDOW();

        vm.warp(releaseAt - 1);
        vm.expectRevert(abi.encodeWithSelector(RentalEscrow.TooEarly.selector, releaseAt));
        escrow.finalize(id);
    }

    /// @dev The one path that would otherwise lock money up forever: a dispute nobody
    ///      judges. There is no withdraw function, so without this the deposit would
    ///      sit in the contract permanently.
    function test_UnjudgedDisputeReleasesToRenterAfterVerdictWindow() public {
        uint256 id = _reachDisputed();

        vm.warp(_disputedAtOf(id) + escrow.VERDICT_WINDOW());
        vm.prank(stranger);
        escrow.finalize(id);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "deposit went back to the renter");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_VerdictWindowIsLongerThanDisputeWindow() public view {
        // Judging needs a person or a model, so it gets more room than clicking a
        // confirm button does. If this ever inverts, a dispute could time out before
        // the resolver realistically had a chance.
        assertGt(escrow.VERDICT_WINDOW(), escrow.DISPUTE_WINDOW());
    }

    function test_DisputeCannotBeReopenedToExtendTheClock() public {
        uint256 id = _reachDisputed();
        uint64 firstOpenedAt = _disputedAtOf(id);

        vm.warp(block.timestamp + 5 days);
        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.CannotDispute.selector, RentalEscrow.Status.Disputed
            )
        );
        escrow.openDispute(id);

        assertEq(_disputedAtOf(id), firstOpenedAt, "clock was not pushed out");
    }

    function test_OnlyAgentOrAdminResolves() public {
        uint256 id = _reachDisputed();

        for (uint256 i = 0; i < 3; i++) {
            address who = [owner, renter, stranger][i];
            vm.prank(who);
            vm.expectRevert(RentalEscrow.NotResolver.selector);
            escrow.resolveDispute(id, RentalEscrow.Verdict.PayOwner);
        }
    }

    /// @dev The human fallback for when the agent pipeline is down mid demo.
    function test_AdminCanResolveWhenTheAgentCannot() public {
        uint256 id = _reachDisputed();

        vm.prank(admin);
        escrow.resolveDispute(id, RentalEscrow.Verdict.Split);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    /// @dev Admin power is bounded to the same three outcomes as the agent. There is no
    ///      amount parameter and no third address to send money to, so a stolen admin
    ///      key can pick the wrong answer but cannot steal.
    function test_AdminCannotSendMoneyAnywhereElse() public {
        uint256 id = _reachDisputed();
        uint256 strangerBefore = usdc.balanceOf(stranger);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(admin);
        escrow.resolveDispute(id, RentalEscrow.Verdict.PayOwner);

        // Only the two parties to the rental ever receive the deposit.
        assertEq(usdc.balanceOf(stranger), strangerBefore, "no third party got paid");
        assertEq(usdc.balanceOf(treasury), treasuryBefore, "no extra fee was taken");
        assertEq(usdc.balanceOf(admin), 0, "the admin cannot pay themselves");
    }

    function test_ResolvedEventRecordsWhichKeyWasUsed() public {
        uint256 id = _reachDisputed();

        vm.expectEmit(true, true, false, true, address(escrow));
        emit RentalEscrow.DisputeResolved(
            id, admin, RentalEscrow.Verdict.RefundRenter, DEPOSIT, 0
        );
        vm.prank(admin);
        escrow.resolveDispute(id, RentalEscrow.Verdict.RefundRenter);
    }

    function test_ConstructorRejectsAdminEqualToAgent() public {
        vm.expectRevert(RentalEscrow.AdminMustDifferFromAgent.selector);
        new RentalEscrow(IERC20(address(usdc)), treasury, agent, agent);
    }

    function test_VerdictRefundRenter() public {
        uint256 id = _reachDisputed();
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(agent);
        escrow.resolveDispute(id, RentalEscrow.Verdict.RefundRenter);

        assertEq(uint256(_statusOf(id)), uint256(RentalEscrow.Status.Completed));
        assertEq(usdc.balanceOf(renter), FUNDS - RENT, "whole deposit back");
        assertEq(usdc.balanceOf(owner), ownerBefore, "owner gets nothing extra");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_VerdictSplit() public {
        uint256 id = _reachDisputed();
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(agent);
        escrow.resolveDispute(id, RentalEscrow.Verdict.Split);

        assertEq(usdc.balanceOf(owner) - ownerBefore, DEPOSIT / 2, "owner half");
        assertEq(usdc.balanceOf(renter), FUNDS - RENT - DEPOSIT / 2, "renter half");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_VerdictPayOwner() public {
        uint256 id = _reachDisputed();
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(agent);
        escrow.resolveDispute(id, RentalEscrow.Verdict.PayOwner);

        assertEq(usdc.balanceOf(owner) - ownerBefore, DEPOSIT, "owner keeps it all");
        assertEq(usdc.balanceOf(renter), FUNDS - RENT - DEPOSIT, "renter lost deposit");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow empty");
    }

    function test_DisputeNeverClawsBackRent() public {
        uint256 id = _reachDisputed();
        uint256 ownerAfterRent = usdc.balanceOf(owner);
        uint256 treasuryAfterFee = usdc.balanceOf(treasury);

        vm.prank(agent);
        escrow.resolveDispute(id, RentalEscrow.Verdict.RefundRenter);

        // The harshest verdict for the owner still leaves the rent they already earned.
        assertEq(ownerAfterRent, RENT - RENT / 100, "rent stayed with the owner");
        assertEq(usdc.balanceOf(treasury), treasuryAfterFee, "fee untouched");
    }

    function test_CannotResolveTwice() public {
        uint256 id = _reachDisputed();
        vm.prank(agent);
        escrow.resolveDispute(id, RentalEscrow.Verdict.Split);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Disputed,
                RentalEscrow.Status.Completed
            )
        );
        escrow.resolveDispute(id, RentalEscrow.Verdict.Split);
    }

    function test_CannotResolveWithoutDispute() public {
        uint256 id = _reachReturned();

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Disputed,
                RentalEscrow.Status.Returned
            )
        );
        escrow.resolveDispute(id, RentalEscrow.Verdict.PayOwner);
    }

    // Calendar ----------------------------------------------------------------

    function test_ApproveMarksEveryDay() public {
        uint256 id = _reachApproved();

        for (uint256 day = _day(START); day < _day(END); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), id, "night booked by this rental");
        }
        assertEq(escrow.bookedDay(LISTING_ID, _day(START) - 1), 0, "day before is free");
        // The return day belongs to nobody, which is what lets the next renter start on it.
        assertEq(escrow.bookedDay(LISTING_ID, _day(END)), 0, "return day is free");
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
        // Holds the nights of START and START + 1. END is the return day and stays free.
        _reachApproved();

        // Starts on the last night the first rental holds, then runs past it.
        uint256 second = _requestAs(renter2, LISTING_ID, END - 1 days, END + 2 days);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(RentalEscrow.DayNotAvailable.selector, _day(END) - 1, 1)
        );
        escrow.approveRental(second);
    }

    /// @dev The handover day is shared: one rental ends on it, the next begins on it,
    ///      exactly as a hotel room changes guests on a single date.
    function test_NextRenterMayStartOnTheReturnDay() public {
        _reachApproved();
        uint256 second = _requestAs(renter2, LISTING_ID, END, END + 2 days);

        vm.prank(owner);
        escrow.approveRental(second);

        assertEq(uint256(_statusOf(second)), uint256(RentalEscrow.Status.Approved));
        assertEq(escrow.bookedDay(LISTING_ID, _day(END)), second, "return day is theirs");
        assertEq(
            escrow.bookedDay(LISTING_ID, _day(END) - 1), 1, "the night before is still ours"
        );
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

        vm.prank(renter);
        escrow.cancel(first);
        assertEq(usdc.balanceOf(renter), FUNDS, "loser is made whole");
    }

    function test_AcceptsExactlyMaxDays() public {
        uint64 end = START + uint64(escrow.MAX_RENTAL_DAYS()) * 1 days;
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

        for (uint256 day = _day(START); day < _day(end); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), id, "night booked");
        }
    }

    function test_RejectsRentalLongerThanMax() public {
        uint64 end = START + (uint64(escrow.MAX_RENTAL_DAYS()) + 1) * 1 days;

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.RentalTooLong.selector,
                escrow.MAX_RENTAL_DAYS() + 1,
                escrow.MAX_RENTAL_DAYS()
            )
        );
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, START, end);
    }

    function test_RejectsRentalAlreadyOver() public {
        vm.warp(END + 1 days);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.RentalAlreadyOver.selector);
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, START, END);
    }

    function test_ShortestRentalIsOneNight() public view {
        assertEq(escrow.dayCount(START, START + 1 days), 1);
    }

    /// @dev Collecting and returning on the same date is zero nights, so there is nothing
    ///      to charge for and nothing to book.
    function test_RejectsSameDayStartAndEnd() public {
        vm.expectRevert(RentalEscrow.InvalidDates.selector);
        escrow.dayCount(START, START);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.InvalidDates.selector);
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, START, START);
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

        for (uint256 day = _day(START); day < _day(END); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), 0, "night freed");
        }

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
        _checkOut(id);

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
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        // Even holding a valid owner signature, the wrong caller is rejected first.
        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotRenter.selector);
        escrow.checkIn(id, deadline, sig);

        vm.prank(owner);
        vm.expectRevert(RentalEscrow.NotRenter.selector);
        escrow.checkIn(id, deadline, sig);
    }

    function test_OnlyOwnerCanCheckOut() public {
        uint256 id = _reachActive();
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_OUT_TYPEHASH, id, deadline, renterKey);

        vm.prank(stranger);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.checkOut(id, deadline, sig);

        vm.prank(renter);
        vm.expectRevert(RentalEscrow.NotOwner.selector);
        escrow.checkOut(id, deadline, sig);
    }

    // Wrong order -------------------------------------------------------------

    function test_CheckInBeforeApproveReverts() public {
        uint256 id = _request();
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Approved,
                RentalEscrow.Status.Requested
            )
        );
        escrow.checkIn(id, deadline, sig);
    }

    function test_CheckOutBeforeCheckInReverts() public {
        uint256 id = _reachApproved();
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_OUT_TYPEHASH, id, deadline, renterKey);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Active,
                RentalEscrow.Status.Approved
            )
        );
        escrow.checkOut(id, deadline, sig);
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
        uint256 deadline = _soon();
        bytes memory sig = _sign(CHECK_IN_TYPEHASH, id, deadline, ownerKey);

        vm.prank(renter);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Approved,
                RentalEscrow.Status.Active
            )
        );
        escrow.checkIn(id, deadline, sig);
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

        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.NotFinalizable.selector, RentalEscrow.Status.None
            )
        );
        escrow.finalize(ghost);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                RentalEscrow.WrongStatus.selector,
                RentalEscrow.Status.Disputed,
                RentalEscrow.Status.None
            )
        );
        escrow.resolveDispute(ghost, RentalEscrow.Verdict.Split);
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
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, END, START);
    }

    function test_RejectsZeroOwner() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        escrow.requestRental(LISTING_ID, address(0), PRICE_PER_DAY, DEPOSIT, START, END);
    }

    function test_RejectsRentingOwnItem() public {
        vm.prank(renter);
        vm.expectRevert(RentalEscrow.CannotRentOwnItem.selector);
        escrow.requestRental(LISTING_ID, renter, PRICE_PER_DAY, DEPOSIT, START, END);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(0)), treasury, agent, admin);

        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(usdc)), address(0), agent, admin);

        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(usdc)), treasury, address(0), admin);

        vm.expectRevert(RentalEscrow.ZeroAddress.selector);
        new RentalEscrow(IERC20(address(usdc)), treasury, agent, address(0));
    }

    // Funding failures --------------------------------------------------------

    function test_RevertsWithoutTokenApproval() public {
        address broke = makeAddr("noApproval");
        usdc.mint(broke, FUNDS);

        vm.prank(broke);
        vm.expectRevert(); // ERC20InsufficientAllowance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, START, END);
    }

    function test_RevertsWithoutEnoughBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, RENT); // enough for rent, not for rent + deposit
        vm.startPrank(poor);
        usdc.approve(address(escrow), type(uint256).max);

        vm.expectRevert(); // ERC20InsufficientBalance from OpenZeppelin
        escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, DEPOSIT, START, END);
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

    // Fuzz --------------------------------------------------------------------

    /// @dev Every unit the renter paid in rent has to land somewhere. Nothing may be
    ///      created and nothing may be left stranded in the escrow.
    function testFuzz_RentSplitLosesNothing(uint256 rate, uint256 deposit) public {
        rate = bound(rate, 1, 1e15);
        deposit = bound(deposit, 0, 1e15);
        uint256 rent = rate * 2; // two nights booked
        usdc.mint(renter, rent + deposit);

        vm.prank(renter);
        uint256 id = escrow.requestRental(LISTING_ID, owner, rate, deposit, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        _checkIn(id);
        vm.warp(block.timestamp + 2 days);
        _checkOut(id);

        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), rent, "rent conserved"
        );
        assertEq(usdc.balanceOf(address(escrow)), deposit, "only deposit remains");
    }

    /// @dev Whatever the renter booked but did not use has to come back, exactly, for any
    ///      day rate and any number of days actually used.
    function testFuzz_UnusedDaysAreRefunded(uint256 rate, uint8 hoursHeld) public {
        rate = bound(rate, 1, 1e15);
        uint256 held = bound(hoursHeld, 0, 47); // inside the two booked days
        uint256 rent = rate * 2;
        usdc.mint(renter, rent + DEPOSIT);
        uint256 before = usdc.balanceOf(renter);

        vm.prank(renter);
        uint256 id = escrow.requestRental(LISTING_ID, owner, rate, DEPOSIT, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        _checkIn(id);
        vm.warp(block.timestamp + held * 1 hours);
        _checkOut(id);

        // Under 24 hours is one day, over is two. Never zero, never more than booked.
        uint256 expectedDays = held <= 24 ? 1 : 2;
        uint256 charged = rate * expectedDays;

        assertEq(
            usdc.balanceOf(owner) + usdc.balanceOf(treasury), charged, "charged the days used"
        );
        assertEq(
            usdc.balanceOf(renter), before - charged - DEPOSIT, "unused days refunded"
        );
        assertEq(usdc.balanceOf(address(escrow)), DEPOSIT, "only the deposit is left");
    }

    /// @dev The renter must never get back more than they put in, and the owner must
    ///      never receive more than the penalty.
    function testFuzz_CancelPenaltyLosesNothing(uint256 rate) public {
        rate = bound(rate, 1, 1e15);
        uint256 rent = rate * 2; // two nights booked
        usdc.mint(renter, rent + DEPOSIT);
        uint256 paidIn = usdc.balanceOf(renter);

        vm.prank(renter);
        uint256 id = escrow.requestRental(LISTING_ID, owner, rate, DEPOSIT, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        vm.prank(renter);
        escrow.cancel(id);

        uint256 penalty = usdc.balanceOf(owner);
        assertEq(penalty, rent / 10, "penalty is exactly ten percent");
        assertEq(usdc.balanceOf(renter), paidIn - penalty, "renter lost only the penalty");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow drained");
    }

    /// @dev All three verdicts must move the whole deposit and leave no dust, for any
    ///      deposit including odd ones that do not halve cleanly.
    function testFuzz_DisputeSplitLosesNothing(uint256 deposit, uint8 verdictRaw) public {
        deposit = bound(deposit, 0, 1e15);
        RentalEscrow.Verdict verdict = RentalEscrow.Verdict(bound(verdictRaw, 0, 2));
        usdc.mint(renter, RENT + deposit);

        vm.prank(renter);
        uint256 id = escrow.requestRental(LISTING_ID, owner, PRICE_PER_DAY, deposit, START, END);
        vm.prank(owner);
        escrow.approveRental(id);
        _checkIn(id);
        _checkOut(id);
        vm.prank(owner);
        escrow.openDispute(id);

        uint256 renterBefore = usdc.balanceOf(renter);
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(agent);
        escrow.resolveDispute(id, verdict);

        uint256 toRenter = usdc.balanceOf(renter) - renterBefore;
        uint256 toOwner = usdc.balanceOf(owner) - ownerBefore;

        assertEq(toRenter + toOwner, deposit, "whole deposit moved, no dust");
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow drained");
        if (verdict == RentalEscrow.Verdict.RefundRenter) {
            assertEq(toRenter, deposit);
        } else if (verdict == RentalEscrow.Verdict.PayOwner) {
            assertEq(toOwner, deposit);
        } else {
            // The odd unit goes to the renter, so their share is never the smaller one.
            assertGe(toRenter, toOwner, "renter is never short changed on a split");
            assertLe(toRenter - toOwner, 1, "split is even to within one unit");
        }
    }

    /// @dev Booking is inclusive of both ends, for any length inside the cap.
    function testFuzz_DayCountMatchesBookedDays(uint16 extraDays) public {
        uint256 span = bound(extraDays, 1, escrow.MAX_RENTAL_DAYS());
        uint64 end = START + uint64(span) * 1 days;

        assertEq(escrow.dayCount(START, end), span, "nights, so the end day is not counted");

        uint256 id = _requestAs(renter, LISTING_ID, START, end);
        vm.prank(owner);
        escrow.approveRental(id);

        for (uint256 day = _day(START); day < _day(end); day++) {
            assertEq(escrow.bookedDay(LISTING_ID, day), id, "inside the range is booked");
        }
        assertEq(escrow.bookedDay(LISTING_ID, _day(end)), 0, "the return day is free");
    }

    /// @dev A signature is only good for the exact nonce it was made with.
    function testFuzz_OnlyTheCurrentNonceIsAccepted(uint8 nonceGuess) public {
        uint256 id = _reachApproved();
        vm.prank(owner);
        escrow.bumpNonce(id); // current nonce is now 1
        uint256 wrongNonce = bound(nonceGuess, 2, 255);

        uint256 deadline = _soon();
        bytes memory sig =
            _signWithNonce(CHECK_IN_TYPEHASH, id, wrongNonce, deadline, ownerKey);

        vm.prank(renter);
        vm.expectRevert();
        escrow.checkIn(id, deadline, sig);
    }
}
