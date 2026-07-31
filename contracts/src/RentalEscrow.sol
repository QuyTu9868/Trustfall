// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/// @title Trustfall rental escrow
/// @notice Holds rent and deposit for one rental and releases them as both sides
///         confirm each step. Listings themselves live off chain in Supabase, so this
///         contract knows nothing about what is being rented or what it should cost.
/// @dev The renter states the amounts when requesting. The owner's approve is what
///      settles the price on chain: money cannot move to the owner before it. Paying
///      too little just means the owner never approves.
///
///      On block.timestamp: Slither flags every comparison against it, and that is
///      expected here. Nothing in this contract turns on seconds. The dispute window
///      is 3 days and a QR signature lives about 10 minutes, so the few seconds a
///      block producer can shift the clock by cannot change any outcome.
contract RentalEscrow is EIP712 {
    using SafeERC20 for IERC20;

    /// @dev None sits at 0 so an id that was never created reverts everywhere.
    ///      New states are appended, never inserted, so existing numbering holds.
    enum Status {
        None,
        Requested,
        Approved,
        Active,
        Returned,
        Completed,
        Cancelled,
        Disputed
    }

    /// @notice The only three outcomes the dispute agent may ask for. It never sends
    ///         an amount: the contract looks the deposit up itself and does the maths,
    ///         so a compromised agent still cannot choose how much money moves.
    enum Verdict {
        RefundRenter,
        Split,
        PayOwner
    }

    /// @dev An optional EIP-2612 approval carried alongside a request. `present` is
    ///      false for the plain entry point, which keeps one code path for both.
    struct Permit {
        bool present;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Rental {
        bytes32 listingId; // uuid of the Supabase listing row
        address owner;
        address renter;
        uint256 pricePerDay;
        uint256 rent; // pricePerDay * booked days, the most the renter can be charged
        uint256 deposit;
        uint64 startDate;
        uint64 endDate;
        uint64 checkedInAt; // set at check-in, starts the 24 hour clock
        uint64 returnedAt; // set at check-out, starts the dispute window
        uint64 disputedAt; // set when a dispute opens, starts the verdict window
        Status status;
    }

    /// @notice A rental day is a full 24 hours from the moment the renter checks in, not
    ///         a calendar square. Collect at 3pm and a day runs to 3pm tomorrow.
    uint64 public constant RENTAL_DAY = 24 hours;

    /// @notice Platform fee in basis points, taken from rent only. 100 bps = 1%.
    uint256 public constant FEE_BPS = 100;
    /// @notice Charged to the renter for cancelling after the owner approved.
    ///         1000 bps = 10%, and it goes to the owner, not the platform.
    uint256 public constant CANCEL_PENALTY_BPS = 1000;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice How long after the rental ends before the deposit can be released,
    ///         and how long either side has to open a dispute.
    uint64 public constant DISPUTE_WINDOW = 3 days;

    /// @notice How long a resolver has to judge an open dispute. Past this, anyone can
    ///         release the deposit to the renter. Without it a dispute nobody judges
    ///         would lock the money up forever, since there is no way to withdraw.
    uint64 public constant VERDICT_WINDOW = 7 days;

    /// @notice Longest rental, counted in nights. Approving writes one storage slot per
    ///         night, so the range has to be bounded or the loop runs out of gas.
    uint256 public constant MAX_RENTAL_DAYS = 30;

    bytes32 private constant CHECK_IN_TYPEHASH =
        keccak256("CheckIn(uint256 rentalId,uint256 nonce,uint256 deadline)");
    bytes32 private constant CHECK_OUT_TYPEHASH =
        keccak256("CheckOut(uint256 rentalId,uint256 nonce,uint256 deadline)");

    IERC20 public immutable usdc;
    address public immutable treasury;
    /// @notice Wallet the server signs dispute verdicts with.
    address public immutable agent;
    /// @notice Human fallback resolver, for when the agent pipeline is down and a
    ///         dispute needs judging now. Has exactly the same power as the agent and
    ///         no more: pick one of three verdicts. Neither can withdraw anything, and
    ///         neither can change any address, because there are no setters at all.
    address public immutable admin;

    mapping(uint256 => Rental) public rentals;

    /// @notice listingId => day number => rental id holding that day. 0 means free.
    /// @dev Day number is the unix timestamp divided by one day.
    mapping(bytes32 => mapping(uint256 => uint256)) public bookedDay;

    /// @notice Included in every QR signature. Either side can bump it to kill codes
    ///         they already showed but no longer want honoured.
    mapping(uint256 => uint256) public rentalNonce;

    /// @dev Starts at 1 so id 0 always means "does not exist".
    uint256 public nextRentalId = 1;

    event RentalRequested(
        uint256 indexed id,
        bytes32 indexed listingId,
        address indexed owner,
        address renter,
        uint256 pricePerDay,
        uint256 rent, // the allowance: price per day times the days booked
        uint256 deposit,
        uint64 startDate,
        uint64 endDate
    );
    event RentalApproved(uint256 indexed id);
    event CheckedIn(uint256 indexed id, uint64 checkedInAt);
    event CheckedOut(uint256 indexed id, uint64 returnedAt);
    /// @dev How the escrowed rent was split once the 24 hour clock stopped.
    event RentSettled(
        uint256 indexed id,
        uint256 charged,
        uint256 toOwner,
        uint256 fee,
        uint256 refundedToRenter
    );
    event RentalCompleted(uint256 indexed id, uint256 depositReturned);
    event RentalCancelled(
        uint256 indexed id, address indexed by, uint256 refundedToRenter, uint256 paidToOwner
    );
    event NonceBumped(uint256 indexed id, uint256 newNonce);
    event DisputeOpened(uint256 indexed id, address indexed by, uint64 at);
    /// @dev `by` is logged so the UI can show whether the agent or the human fallback
    ///      made the call. A privileged action nobody can see is the dangerous kind.
    event DisputeResolved(
        uint256 indexed id,
        address indexed by,
        Verdict verdict,
        uint256 toRenter,
        uint256 toOwner
    );

    error ZeroAddress();
    error ZeroRent();
    error InvalidDates();
    error RentalTooLong(uint256 numDays, uint256 maximum);
    error RentalAlreadyOver();
    error CannotRentOwnItem();
    error NotOwner();
    error NotRenter();
    error NotParty();
    error NotResolver();
    error AdminMustDifferFromAgent();
    error WrongStatus(Status expected, Status actual);
    error NotCancellable(Status actual);
    error NotFinalizable(Status actual);
    error CannotDispute(Status actual);
    error TooEarly(uint64 releaseAt);
    error TooLate(uint64 deadline);
    error SignatureExpired(uint256 deadline);
    error BadSignature(address expected, address recovered);
    error DayNotAvailable(uint256 day, uint256 takenBy);

    constructor(IERC20 usdc_, address treasury_, address agent_, address admin_)
        EIP712("Trustfall", "1")
    {
        if (
            address(usdc_) == address(0) || treasury_ == address(0)
                || agent_ == address(0) || admin_ == address(0)
        ) {
            revert ZeroAddress();
        }
        // Two separate keys or the fallback is pointless: if one key holds both roles,
        // losing it takes out the agent and the human backup at the same time.
        if (admin_ == agent_) revert AdminMustDifferFromAgent();

        usdc = usdc_;
        treasury = treasury_;
        agent = agent_;
        admin = admin_;
    }

    /// @notice Renter asks to rent something and funds the escrow in the same call.
    /// @dev Deliberately does not check the calendar. A request that overlaps an
    ///      approved booking is allowed to exist; it just cannot be approved later.
    ///      Blocking here instead would let anyone lock up a listing's whole calendar
    ///      with requests and then cancel for a full refund.
    /// @param listingId uuid of the Supabase listing, for matching rows off chain
    /// @param owner Wallet that owns the item, taken from the listing
    /// @param pricePerDay Cost of one 24 hour day, in USDC. The contract multiplies.
    /// @param deposit Refundable deposit, in USDC
    /// @return id The new rental id, also emitted for Supabase to mirror
    function requestRental(
        bytes32 listingId,
        address owner,
        uint256 pricePerDay,
        uint256 deposit,
        uint64 startDate,
        uint64 endDate
    ) external returns (uint256 id) {
        // Spelled out rather than left to default so the absence is deliberate on the
        // page, not something a reader has to infer from what is missing.
        Permit memory none = Permit({present: false, deadline: 0, v: 0, r: 0, s: 0});
        return
            _createRental(listingId, owner, pricePerDay, deposit, startDate, endDate, none);
    }

    /**
     * @notice The same request, but approving the USDC in the same signature.
     *
     * @dev Without this a renter signs twice: once to approve the token, once to request.
     *      CLAUDE.md section 9 is blunt that every extra wallet popup is a chance for
     *      somebody to give up, and the first popup is the worst place to lose them.
     *
     *      The permit is wrapped in try/catch on purpose. Anyone watching the mempool can
     *      copy the permit out of this transaction and submit it alone, which would make
     *      the allowance already set and this call revert on a replayed permit. Ignoring
     *      that failure costs nothing: if the allowance really is missing, the transfer
     *      below reverts anyway.
     */
    function requestRentalWithPermit(
        bytes32 listingId,
        address owner,
        uint256 pricePerDay,
        uint256 deposit,
        uint64 startDate,
        uint64 endDate,
        uint256 permitDeadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (uint256 id) {
        return _createRental(
            listingId,
            owner,
            pricePerDay,
            deposit,
            startDate,
            endDate,
            Permit({present: true, deadline: permitDeadline, v: v, r: r, s: s})
        );
    }

    function _createRental(
        bytes32 listingId,
        address owner,
        uint256 pricePerDay,
        uint256 deposit,
        uint64 startDate,
        uint64 endDate,
        Permit memory permit_
    ) private returns (uint256 id) {
        if (owner == address(0)) revert ZeroAddress();
        if (owner == msg.sender) revert CannotRentOwnItem();
        if (pricePerDay == 0) revert ZeroRent();
        // A rental that already ended would have its deposit release deadline in the
        // past, which would skip the dispute window entirely.
        if (endDate < block.timestamp) revert RentalAlreadyOver();

        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        // The booked range still runs in nights, because that is the unit the calendar
        // blocks in. What it buys is an allowance: the most days this rental can be
        // charged for. What is actually charged is settled from the clock at check-out.
        if (endDay <= startDay) revert InvalidDates();
        uint256 numDays = endDay - startDay;
        if (numDays > MAX_RENTAL_DAYS) revert RentalTooLong(numDays, MAX_RENTAL_DAYS);

        // The contract multiplies rather than accepting a total from the caller. A total
        // that disagreed with the day rate would charge one number while the screen
        // showed another, and there would be no way to tell which was wrong.
        uint256 rent = pricePerDay * numDays;

        id = nextRentalId++;
        rentals[id] = Rental({
            listingId: listingId,
            owner: owner,
            renter: msg.sender,
            pricePerDay: pricePerDay,
            rent: rent,
            deposit: deposit,
            startDate: startDate,
            endDate: endDate,
            checkedInAt: 0,
            returnedAt: 0,
            disputedAt: 0,
            status: Status.Requested
        });

        emit RentalRequested(
            id, listingId, owner, msg.sender, pricePerDay, rent, deposit, startDate, endDate
        );

        // Interactions last, after every state change above, so nothing this contract
        // owns can be observed half written from outside. The permit is a call into the
        // token, so it belongs down here with the transfer rather than at the top.
        uint256 amount = rent + deposit;
        if (permit_.present) {
            try IERC20Permit(address(usdc)).permit(
                msg.sender, address(this), amount, permit_.deadline, permit_.v, permit_.r, permit_.s
            ) {} catch {}
        }
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Owner accepts the request. This is the moment the price is agreed and
    ///         the moment the calendar is claimed.
    function approveRental(uint256 id) external {
        Rental storage rental = _expect(id, Status.Requested);
        if (msg.sender != rental.owner) revert NotOwner();

        _bookDays(rental.listingId, rental.startDate, rental.endDate, id);

        rental.status = Status.Approved;
        emit RentalApproved(id);
    }

    /// @notice Renter confirms they received the item, which releases the rent.
    /// @dev The owner shows a QR code holding their signature, the renter scans it and
    ///      sends this transaction. The renter is the caller on purpose: if the owner
    ///      could call it, they would collect rent without handing the item over.
    ///      The deposit stays here until finalize or a dispute verdict.
    /// @param deadline Unix time the owner's signature stops being accepted
    /// @param signature Owner's EIP-712 signature over (rentalId, nonce, deadline)
    function checkIn(uint256 id, uint256 deadline, bytes calldata signature) external {
        Rental storage rental = _expect(id, Status.Approved);
        if (msg.sender != rental.renter) revert NotRenter();
        _requireSignature(CHECK_IN_TYPEHASH, id, deadline, signature, rental.owner);

        // Nothing is paid out here, unlike before. A rental day is 24 hours from this
        // moment, so how much the renter owes is not known until the item comes back.
        // The rent stays in escrow and is settled on the way out of Active.
        uint64 now_ = uint64(block.timestamp);
        rental.checkedInAt = now_;
        rental.status = Status.Active;
        emit CheckedIn(id, now_);
    }

    /// @notice Owner confirms the item came back, which starts the dispute window.
    /// @dev Mirror of checkIn: at checkout the renter shows the code and the owner
    ///      scans, so the owner sends this transaction with the renter's signature.
    function checkOut(uint256 id, uint256 deadline, bytes calldata signature) external {
        Rental storage rental = _expect(id, Status.Active);
        if (msg.sender != rental.owner) revert NotOwner();
        _requireSignature(CHECK_OUT_TYPEHASH, id, deadline, signature, rental.renter);

        uint64 now_ = uint64(block.timestamp);
        rental.returnedAt = now_;
        rental.status = Status.Returned;
        emit CheckedOut(id, now_);

        // The clock stops here, so this is where the rent is finally worked out.
        _settleRent(id, rental, now_);
    }

    /// @notice Invalidate every QR code already shown for this rental.
    /// @dev Showing a code and then changing your mind has to be undoable, otherwise
    ///      the code stays valid until the other side uses it. Either party can bump,
    ///      and it kills both directions at once since only one of check-in and
    ///      check-out is ever valid at a given status.
    function bumpNonce(uint256 id) external {
        Rental storage rental = rentals[id];
        if (msg.sender != rental.owner && msg.sender != rental.renter) revert NotParty();

        uint256 next = ++rentalNonce[id];
        emit NonceBumped(id, next);
    }

    /// @notice Either side backs out before the item changes hands.
    /// @dev Cancelling after approve frees the calendar again so the owner can relet
    ///      those days. After check-in nothing can be cancelled: the item is out, and
    ///      that is what the dispute flow is for.
    function cancel(uint256 id) external {
        Rental storage rental = rentals[id];
        Status status = rental.status;
        address owner = rental.owner;
        address renter = rental.renter;

        if (msg.sender != owner && msg.sender != renter) revert NotParty();

        // Zero is the answer for most paths, so say so rather than leaning on the
        // default. It also keeps Slither's uninitialised-local report empty, which is
        // what makes a real finding stand out later.
        uint256 refund = 0;
        uint256 penalty = 0;

        if (status == Status.Requested) {
            // Nothing was promised yet, so nothing is owed either way.
            refund = rental.rent + rental.deposit;
        } else if (status == Status.Approved) {
            if (msg.sender == renter) {
                // The owner held the dates and turned other people away, so the
                // penalty compensates them, not the platform.
                penalty = (rental.rent * CANCEL_PENALTY_BPS) / BPS_DENOMINATOR;
                refund = rental.rent - penalty + rental.deposit;
            } else {
                // The owner is the one backing out, so the renter loses nothing.
                refund = rental.rent + rental.deposit;
            }
            _freeDays(rental.listingId, rental.startDate, rental.endDate, id);
        } else {
            revert NotCancellable(status);
        }

        rental.status = Status.Cancelled;
        emit RentalCancelled(id, msg.sender, refund, penalty);

        if (refund > 0) usdc.safeTransfer(renter, refund);
        if (penalty > 0) usdc.safeTransfer(owner, penalty);
    }

    /// @notice Either side says something went wrong with the item.
    /// @dev Only about the deposit. The rent left at check-in and is not clawed back.
    ///      Has to be opened before the release deadline, otherwise the timeout would
    ///      mean nothing: letting the window lapse is exactly what "no complaint" is.
    function openDispute(uint256 id) external {
        Rental storage rental = rentals[id];
        Status status = rental.status;
        if (msg.sender != rental.owner && msg.sender != rental.renter) revert NotParty();
        // Disputed also has a deadline, but reopening one would reset the verdict clock
        // and let either side push it out forever, so only these two states qualify.
        if (status != Status.Active && status != Status.Returned) {
            revert CannotDispute(status);
        }

        (uint64 deadline,) = _releaseDeadline(rental);
        if (block.timestamp >= deadline) revert TooLate(deadline);

        uint64 now_ = uint64(block.timestamp);
        rental.disputedAt = now_;
        rental.status = Status.Disputed;
        emit DisputeOpened(id, msg.sender, now_);

        // Coming from Active the rent has not been worked out yet, and the verdict only
        // ever touches the deposit. Settle it now so a dispute cannot leave the rent
        // stranded. From Returned it was already settled at check-out.
        if (status == Status.Active) _settleRent(id, rental, now_);
    }

    /// @notice Agent, or the human fallback, applies one of three verdicts.
    /// @dev Takes a verdict, never an amount. The contract reads the deposit from
    ///      storage and splits it itself, so the worst a stolen resolver key can do is
    ///      pick the wrong one of three outcomes. There is no path to drain the escrow
    ///      and no path to redirect money to a third address.
    ///
    ///      One function rather than two so the split maths exists in exactly one
    ///      place. Which key was used is recorded in the event instead.
    function resolveDispute(uint256 id, Verdict verdict) external {
        if (msg.sender != agent && msg.sender != admin) revert NotResolver();
        Rental storage rental = _expect(id, Status.Disputed);

        uint256 deposit = rental.deposit;
        address renter = rental.renter;
        address owner = rental.owner;

        uint256 toRenter = 0;
        uint256 toOwner = 0;
        if (verdict == Verdict.RefundRenter) {
            toRenter = deposit;
        } else if (verdict == Verdict.Split) {
            toOwner = deposit / 2;
            // Subtract so an odd deposit leaves nothing stuck, and the odd unit goes
            // to the renter, whose money it was to begin with.
            toRenter = deposit - toOwner;
        } else {
            toOwner = deposit;
        }

        rental.status = Status.Completed;
        emit DisputeResolved(id, msg.sender, verdict, toRenter, toOwner);

        if (toRenter > 0) usdc.safeTransfer(renter, toRenter);
        if (toOwner > 0) usdc.safeTransfer(owner, toOwner);
    }

    /// @notice Returns the deposit to the renter and closes the rental.
    /// @dev Open to anyone on purpose. It only pushes money back to its owner, so
    ///      there is nothing to exploit, and it has to work even when the owner is
    ///      away, which is the whole point of the timeout.
    ///
    ///      Three ways in. From Returned the owner confirmed the item came back and had
    ///      the dispute window to complain. From Active the owner never confirmed at
    ///      all: they could have called checkOut or opened a dispute, and doing
    ///      neither counts as no complaint. From Disputed nobody judged within the
    ///      verdict window, which is the platform's failure, not the renter's.
    ///
    ///      Every path sends the deposit to the renter, because in all three cases
    ///      someone else had the chance to act and did not take it.
    function finalize(uint256 id) external {
        Rental storage rental = rentals[id];
        Status wasStatus = rental.status;

        (uint64 releaseAt, bool timed) = _releaseDeadline(rental);
        if (!timed) revert NotFinalizable(wasStatus);
        if (block.timestamp < releaseAt) revert TooEarly(releaseAt);

        uint256 deposit = rental.deposit;
        address renter = rental.renter;

        rental.status = Status.Completed;
        emit RentalCompleted(id, deposit);

        // Straight from Active means the owner never confirmed the return, so the rent is
        // still sitting here. Settling from now is always past the booked range, so the
        // cap in _rentOwed charges the full booking, which is right: the renter kept the
        // item and nobody said otherwise.
        if (wasStatus == Status.Active) _settleRent(id, rental, uint64(block.timestamp));

        if (deposit > 0) usdc.safeTransfer(renter, deposit);
    }

    /// @notice Nights in a range, for the frontend to price a rental before requesting.
    /// @dev The end date is the day the item comes back, so it is not itself charged.
    function dayCount(uint64 startDate, uint64 endDate) public pure returns (uint256) {
        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        if (endDay <= startDay) revert InvalidDates();
        return endDay - startDay;
    }

    /// @dev Loads a rental and asserts its current status. An id that does not exist
    ///      has status None, so it fails here too.
    function _expect(uint256 id, Status expected) private view returns (Rental storage) {
        Rental storage rental = rentals[id];
        if (rental.status != expected) revert WrongStatus(expected, rental.status);
        return rental;
    }

    /**
     * @dev Works out what the rental actually cost and pays everyone out.
     *
     *      Called on every way out of Active, and only from there, so the rent is settled
     *      exactly once. Leaving Active by check-out settles from the return time; by
     *      dispute, from the moment the complaint was raised; by timeout, from now, which
     *      is past the booked range and so lands on the full booked amount anyway. No
     *      special cases: the cap does that work.
     */
    function _settleRent(uint256 id, Rental storage rental, uint64 endedAt) private {
        uint256 owed = _rentOwed(rental, endedAt);
        uint256 fee = (owed * FEE_BPS) / BPS_DENOMINATOR;
        // Subtract rather than recompute, so no rounding dust is left stuck here.
        uint256 ownerPayout = owed - fee;
        uint256 refund = rental.rent - owed;

        address owner = rental.owner;
        address renter = rental.renter;

        emit RentSettled(id, owed, ownerPayout, fee, refund);

        if (ownerPayout > 0) usdc.safeTransfer(owner, ownerPayout);
        if (fee > 0) usdc.safeTransfer(treasury, fee);
        // Whatever the renter booked but did not use goes straight back.
        if (refund > 0) usdc.safeTransfer(renter, refund);
    }

    /**
     * @dev Days owed, counted in whole 24 hour blocks from check-in.
     *
     *      Any started day is a whole day, which is how vehicle hire works everywhere:
     *      keep it 25 hours and that is two days. Never less than one, so a renter cannot
     *      collect an item and hand it straight back for free. Never more than the days
     *      booked, because the contract only holds that much and cannot reach into the
     *      renter's wallet for more. Keeping the item longer than booked is what the
     *      deposit and the dispute flow are for.
     */
    function _rentOwed(Rental storage rental, uint64 endedAt) private view returns (uint256) {
        uint64 startedAt = rental.checkedInAt;
        uint256 elapsed = endedAt > startedAt ? endedAt - startedAt : 0;

        // Up to and including 24 hours is one day. Past that, round up. Written this way
        // round so there is no separate "what if it is zero" case to get wrong.
        //
        // Slither flags the division before the multiply below as precision loss. Here
        // the precision loss is the whole point: rental days are whole days, and 25 hours
        // has to become 2 rather than 2.08. Multiplying first would price by the second.
        uint256 daysUsed =
            elapsed <= RENTAL_DAY ? 1 : (elapsed + RENTAL_DAY - 1) / RENTAL_DAY;

        (uint256 startDay, uint256 endDay) = _dayRange(rental.startDate, rental.endDate);
        uint256 booked = endDay - startDay;
        if (daysUsed > booked) daysUsed = booked;

        return rental.pricePerDay * daysUsed;
    }

    /// @dev The one clock that both the timeout and the dispute window read from.
    ///      Returns timed = false when the rental is not in a state that has a
    ///      deadline at all, so each caller can raise its own error.
    ///
    ///      From Returned it counts from the owner's confirmation. From Active the
    ///      owner never confirmed, so it counts from the day the rental ended. From
    ///      Disputed it counts from when the dispute opened, and the window is longer
    ///      because judging takes a person or a model, not just a click.
    function _releaseDeadline(Rental storage rental)
        private
        view
        returns (uint64 deadline, bool timed)
    {
        Status status = rental.status;
        if (status == Status.Returned) return (rental.returnedAt + DISPUTE_WINDOW, true);
        if (status == Status.Active) return (rental.endDate + DISPUTE_WINDOW, true);
        if (status == Status.Disputed) return (rental.disputedAt + VERDICT_WINDOW, true);
        return (0, false);
    }

    /// @dev Three independent things make a captured QR code useless: the status has
    ///      already moved on, the deadline has passed, or the nonce was bumped.
    function _requireSignature(
        bytes32 typeHash,
        uint256 id,
        uint256 deadline,
        bytes calldata signature,
        address expectedSigner
    ) private view {
        if (block.timestamp > deadline) revert SignatureExpired(deadline);

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(typeHash, id, rentalNonce[id], deadline))
        );
        address recovered = ECDSA.recoverCalldata(digest, signature);
        if (recovered != expectedSigner) revert BadSignature(expectedSigner, recovered);
    }

    /// @dev Both ends inclusive: renting for one day means startDay == endDay.
    function _dayRange(uint64 startDate, uint64 endDate)
        private
        pure
        returns (uint256 startDay, uint256 endDay)
    {
        startDay = uint256(startDate) / 1 days;
        endDay = uint256(endDate) / 1 days;
    }

    function _bookDays(bytes32 listingId, uint64 startDate, uint64 endDate, uint256 id)
        private
    {
        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        // Stops before the end day: that is the day the item comes back, so somebody else
        // can start their rental on it.
        for (uint256 day = startDay; day < endDay; day++) {
            uint256 takenBy = bookedDay[listingId][day];
            if (takenBy != 0) revert DayNotAvailable(day, takenBy);
            bookedDay[listingId][day] = id;
        }
    }

    function _freeDays(bytes32 listingId, uint64 startDate, uint64 endDate, uint256 id)
        private
    {
        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        // Same range as _bookDays, or cancelling would leave a day locked forever.
        for (uint256 day = startDay; day < endDay; day++) {
            // Only clear days this rental actually holds, never someone else's.
            if (bookedDay[listingId][day] == id) delete bookedDay[listingId][day];
        }
    }
}
