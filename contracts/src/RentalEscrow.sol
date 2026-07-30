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
    enum Status {
        None,
        Requested,
        Approved,
        Active,
        Returned,
        Completed
    }

    struct Rental {
        bytes32 listingId; // uuid of the Supabase listing row
        address owner;
        address renter;
        uint256 rent;
        uint256 deposit;
        uint64 startDate;
        uint64 endDate;
        Status status;
    }

    /// @notice Platform fee in basis points, taken from rent only. 100 bps = 1%.
    uint256 public constant FEE_BPS = 100;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    address public immutable treasury;

    mapping(uint256 => Rental) public rentals;

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
    event CheckedOut(uint256 indexed id);
    event RentalCompleted(uint256 indexed id, uint256 depositReturned);

    error ZeroAddress();
    error ZeroRent();
    error InvalidDates();
    error CannotRentOwnItem();
    error NotOwner();
    error NotRenter();
    error WrongStatus(Status expected, Status actual);

    constructor(IERC20 usdc_, address treasury_) {
        if (address(usdc_) == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        usdc = usdc_;
        treasury = treasury_;
    }

    /// @notice Renter asks to rent something and funds the escrow in the same call.
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

        id = nextRentalId++;
        rentals[id] = Rental({
            listingId: listingId,
            owner: owner,
            renter: msg.sender,
            rent: rent,
            deposit: deposit,
            startDate: startDate,
            endDate: endDate,
            status: Status.Requested
        });

        emit RentalRequested(
            id, listingId, owner, msg.sender, rent, deposit, startDate, endDate
        );

        usdc.safeTransferFrom(msg.sender, address(this), rent + deposit);
    }

    /// @notice Owner accepts the request. This is the moment the price is agreed.
    function approveRental(uint256 id) external {
        Rental storage rental = _expect(id, Status.Requested);
        if (msg.sender != rental.owner) revert NotOwner();

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

    /// @notice Owner confirms the item came back.
    /// @dev Mirror of checkIn: at checkout the renter shows the code and the owner
    ///      scans, so the owner sends this transaction.
    function checkOut(uint256 id) external {
        Rental storage rental = _expect(id, Status.Active);
        if (msg.sender != rental.owner) revert NotOwner();

        rental.status = Status.Returned;
        emit CheckedOut(id);
    }

    /// @notice Returns the deposit to the renter and closes the rental.
    /// @dev Open to anyone on purpose. It only pushes money back to its owner, so
    ///      there is nothing to exploit, and checkpoint 2 needs exactly this shape
    ///      for the 3 day timeout release that must work even if the owner is away.
    function finalize(uint256 id) external {
        Rental storage rental = _expect(id, Status.Returned);

        uint256 deposit = rental.deposit;
        address renter = rental.renter;

        rental.status = Status.Completed;
        emit RentalCompleted(id, deposit);

        if (deposit > 0) usdc.safeTransfer(renter, deposit);
    }

    /// @dev Loads a rental and asserts its current status. An id that does not exist
    ///      has status None, so it fails here too.
    function _expect(uint256 id, Status expected) private view returns (Rental storage) {
        Rental storage rental = rentals[id];
        if (rental.status != expected) revert WrongStatus(expected, rental.status);
        return rental;
    }
}
