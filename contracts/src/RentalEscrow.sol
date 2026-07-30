// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Trustfall rental escrow
/// @notice Holds rent and deposit for one rental and releases them as both sides
///         confirm each step. Listings themselves live off chain in Supabase, so this
///         contract knows nothing about what is being rented or what it should cost.
/// @dev The renter states the amounts when requesting. The owner's approve is what
///      settles the price on chain: money cannot move to the owner before it. Paying
///      too little just means the owner never approves.
contract RentalEscrow {
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
        Cancelled
    }

    struct Rental {
        bytes32 listingId; // uuid of the Supabase listing row
        address owner;
        address renter;
        uint256 rent;
        uint256 deposit;
        uint64 startDate;
        uint64 endDate;
        uint64 returnedAt; // set at check-out, starts the dispute window
        Status status;
    }

    /// @notice Platform fee in basis points, taken from rent only. 100 bps = 1%.
    uint256 public constant FEE_BPS = 100;
    /// @notice Charged to the renter for cancelling after the owner approved.
    ///         1000 bps = 10%, and it goes to the owner, not the platform.
    uint256 public constant CANCEL_PENALTY_BPS = 1000;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    /// @notice How long after the rental ends before the deposit can be released.
    uint64 public constant DISPUTE_WINDOW = 3 days;

    /// @notice Approving marks every day of the range as booked, one storage write per
    ///         day, so the range has to be bounded or the loop runs out of gas.
    uint256 public constant MAX_RENTAL_DAYS = 30;

    IERC20 public immutable usdc;
    address public immutable treasury;

    mapping(uint256 => Rental) public rentals;

    /// @notice listingId => day number => rental id holding that day. 0 means free.
    /// @dev Day number is the unix timestamp divided by one day.
    mapping(bytes32 => mapping(uint256 => uint256)) public bookedDay;

    /// @dev Starts at 1 so id 0 always means "does not exist".
    uint256 public nextRentalId = 1;

    event RentalRequested(
        uint256 indexed id,
        bytes32 indexed listingId,
        address indexed owner,
        address renter,
        uint256 rent,
        uint256 deposit,
        uint64 startDate,
        uint64 endDate
    );
    event RentalApproved(uint256 indexed id);
    event CheckedIn(uint256 indexed id, uint256 ownerPayout, uint256 fee);
    event CheckedOut(uint256 indexed id, uint64 returnedAt);
    event RentalCompleted(uint256 indexed id, uint256 depositReturned);
    event RentalCancelled(
        uint256 indexed id, address indexed by, uint256 refundedToRenter, uint256 paidToOwner
    );

    error ZeroAddress();
    error ZeroRent();
    error InvalidDates();
    error RentalTooLong(uint256 days_, uint256 maximum);
    error RentalAlreadyOver();
    error CannotRentOwnItem();
    error NotOwner();
    error NotRenter();
    error NotParty();
    error WrongStatus(Status expected, Status actual);
    error NotCancellable(Status actual);
    error NotFinalizable(Status actual);
    error TooEarly(uint64 releaseAt);
    error DayNotAvailable(uint256 day, uint256 takenBy);

    constructor(IERC20 usdc_, address treasury_) {
        if (address(usdc_) == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        usdc = usdc_;
        treasury = treasury_;
    }

    /// @notice Renter asks to rent something and funds the escrow in the same call.
    /// @dev Deliberately does not check the calendar. A request that overlaps an
    ///      approved booking is allowed to exist; it just cannot be approved later.
    ///      Blocking here instead would let anyone lock up a listing's whole calendar
    ///      with requests and then cancel for a full refund.
    /// @param listingId uuid of the Supabase listing, for matching rows off chain
    /// @param owner Wallet that owns the item, taken from the listing
    /// @param rent Total rent for the whole period, in USDC
    /// @param deposit Refundable deposit, in USDC
    /// @return id The new rental id, also emitted for Supabase to mirror
    function requestRental(
        bytes32 listingId,
        address owner,
        uint256 rent,
        uint256 deposit,
        uint64 startDate,
        uint64 endDate
    ) external returns (uint256 id) {
        if (owner == address(0)) revert ZeroAddress();
        if (owner == msg.sender) revert CannotRentOwnItem();
        if (rent == 0) revert ZeroRent();
        if (endDate < startDate) revert InvalidDates();
        // A rental that already ended would have its deposit release deadline in the
        // past, which would skip the dispute window entirely.
        if (endDate < block.timestamp) revert RentalAlreadyOver();

        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        uint256 numDays = endDay - startDay + 1;
        if (numDays > MAX_RENTAL_DAYS) revert RentalTooLong(numDays, MAX_RENTAL_DAYS);

        id = nextRentalId++;
        rentals[id] = Rental({
            listingId: listingId,
            owner: owner,
            renter: msg.sender,
            rent: rent,
            deposit: deposit,
            startDate: startDate,
            endDate: endDate,
            returnedAt: 0,
            status: Status.Requested
        });

        emit RentalRequested(
            id, listingId, owner, msg.sender, rent, deposit, startDate, endDate
        );

        usdc.safeTransferFrom(msg.sender, address(this), rent + deposit);
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
    /// @dev The renter is the caller because checkpoint 2 turns this into a QR scan:
    ///      the owner shows the code, the renter scans and sends the transaction.
    ///      Letting the owner call it would let them collect rent without handing
    ///      the item over. The deposit stays here until finalize.
    function checkIn(uint256 id) external {
        Rental storage rental = _expect(id, Status.Approved);
        if (msg.sender != rental.renter) revert NotRenter();

        uint256 fee = (rental.rent * FEE_BPS) / BPS_DENOMINATOR;
        // Subtract rather than recompute, so no rounding dust is left stuck here.
        uint256 ownerPayout = rental.rent - fee;
        address owner = rental.owner;

        rental.status = Status.Active;
        emit CheckedIn(id, ownerPayout, fee);

        usdc.safeTransfer(owner, ownerPayout);
        if (fee > 0) usdc.safeTransfer(treasury, fee);
    }

    /// @notice Owner confirms the item came back, which starts the dispute window.
    /// @dev Mirror of checkIn: at checkout the renter shows the code and the owner
    ///      scans, so the owner sends this transaction.
    function checkOut(uint256 id) external {
        Rental storage rental = _expect(id, Status.Active);
        if (msg.sender != rental.owner) revert NotOwner();

        uint64 now_ = uint64(block.timestamp);
        rental.returnedAt = now_;
        rental.status = Status.Returned;
        emit CheckedOut(id, now_);
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

        uint256 refund;
        uint256 penalty;

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

    /// @notice Returns the deposit to the renter and closes the rental.
    /// @dev Open to anyone on purpose. It only pushes money back to its owner, so
    ///      there is nothing to exploit, and it has to work even when the owner is
    ///      away, which is the whole point of the timeout.
    ///
    ///      Two ways in. From Returned the owner confirmed the item came back and had
    ///      the dispute window to complain. From Active the owner never confirmed at
    ///      all: they could have called checkOut or opened a dispute, and doing
    ///      neither counts as no complaint, so the deposit is not held hostage.
    function finalize(uint256 id) external {
        Rental storage rental = rentals[id];
        Status status = rental.status;

        uint64 releaseAt;
        if (status == Status.Returned) {
            releaseAt = rental.returnedAt + DISPUTE_WINDOW;
        } else if (status == Status.Active) {
            releaseAt = rental.endDate + DISPUTE_WINDOW;
        } else {
            revert NotFinalizable(status);
        }
        if (block.timestamp < releaseAt) revert TooEarly(releaseAt);

        uint256 deposit = rental.deposit;
        address renter = rental.renter;

        rental.status = Status.Completed;
        emit RentalCompleted(id, deposit);

        if (deposit > 0) usdc.safeTransfer(renter, deposit);
    }

    /// @notice Number of days in a range, for the frontend to show before requesting.
    function dayCount(uint64 startDate, uint64 endDate) external pure returns (uint256) {
        if (endDate < startDate) revert InvalidDates();
        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        return endDay - startDay + 1;
    }

    /// @dev Loads a rental and asserts its current status. An id that does not exist
    ///      has status None, so it fails here too.
    function _expect(uint256 id, Status expected) private view returns (Rental storage) {
        Rental storage rental = rentals[id];
        if (rental.status != expected) revert WrongStatus(expected, rental.status);
        return rental;
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
        for (uint256 day = startDay; day <= endDay; day++) {
            uint256 takenBy = bookedDay[listingId][day];
            if (takenBy != 0) revert DayNotAvailable(day, takenBy);
            bookedDay[listingId][day] = id;
        }
    }

    function _freeDays(bytes32 listingId, uint64 startDate, uint64 endDate, uint256 id)
        private
    {
        (uint256 startDay, uint256 endDay) = _dayRange(startDate, endDate);
        for (uint256 day = startDay; day <= endDay; day++) {
            // Only clear days this rental actually holds, never someone else's.
            if (bookedDay[listingId][day] == id) delete bookedDay[listingId][day];
        }
    }
}
