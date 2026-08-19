import { BaseError, ContractFunctionRevertedError } from "viem";
import { STATUS } from "./escrow";

/**
 * Turns a revert into a sentence somebody can act on.
 *
 * Every custom error in RentalEscrow is in the ABI, so viem decodes the name and the
 * arguments and hands them over. Nothing was reading them. Four screens took viem's
 * shortMessage instead, which for a custom error is "The contract function
 * \\"approveRental\\" reverted." and names neither what went wrong nor what to do.
 *
 * The case that showed it up: two people ask for the same listing on the same dates, the
 * owner accepts the first, and accepting the second reverts on DayNotAvailable. The owner
 * saw a generic failure and no reason, on the one screen where the reason is the whole
 * answer, and the error carries both the day and the rental that took it.
 *
 * Reverts here are almost never faults. They are two people racing for the same thing, a
 * page open long enough to go stale, or a QR code past its deadline. Each one has a next
 * move, and the point of this file is to say what it is.
 */

const day = (index: bigint) =>
  new Date(Number(index) * 86_400_000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const at = (unix: bigint) => new Date(Number(unix) * 1000).toLocaleString();

const status = (index: unknown) => STATUS[Number(index)] ?? "in another state";

function fromRevert(name: string, args: readonly unknown[]): string | null {
  switch (name) {
    // The reported one. Both arguments are worth printing: the date says which part of the
    // range is gone, so the owner can suggest another, and the rental id says where it went.
    case "DayNotAvailable":
      return `Somebody else already has ${day(args[0] as bigint)} on this item, under rental #${args[1]}. Accepting two rentals over the same day is the one thing the contract will not do.`;

    // Almost always a stale page: the other party acted while this one sat open.
    case "WrongStatus":
      return `This rental is ${status(args[1])} now, not ${status(args[0])}. Somebody acted on it while this page was open, so reload before trying again.`;
    case "NotCancellable":
      return `A rental cannot be cancelled once it is ${status(args[0])}.`;
    case "NotFinalizable":
      return `There is nothing to close: this rental is ${status(args[0])}.`;
    case "CannotDispute":
      return `A dispute can only be opened while the item is out or just back. This one is ${status(args[0])}.`;

    case "TooEarly":
      return `Not yet. This opens ${at(args[0] as bigint)}.`;
    case "TooLate":
      return `Too late. That closed ${at(args[0] as bigint)}.`;

    // The QR pair. Both mean "get a fresh code", which is the part somebody needs told.
    case "SignatureExpired":
      return `That code expired ${at(args[0] as bigint)}. Ask the other person to show a new one.`;
    case "BadSignature":
      return "That code was not signed by the other party to this rental. Scan the one on their screen rather than an older photograph of it.";

    case "NotOwner":
      return "Only the owner of this item can do that.";
    case "NotRenter":
      return "Only the renter on this rental can do that.";
    case "NotParty":
      return "Only the two people on this rental can do that.";
    case "NotResolver":
      return "Only the arbitrator's address can settle a dispute.";

    case "CannotRentOwnItem":
      return "This is your own listing.";
    case "RentalTooLong":
      return `That is ${args[0]} days. The contract caps a rental at ${args[1]}.`;
    case "InvalidDates":
      return "Those dates do not make a rental. The return date has to be after the collection date.";
    case "RentalAlreadyOver":
      return "Those dates have already passed.";
    case "ZeroRent":
      return "This listing has no price on it.";

    default:
      return null;
  }
}

/**
 * The sentence to show, given whatever the wallet or the node threw.
 *
 * Falls back rather than guessing. An error this does not recognise keeps viem's own
 * summary, which is worse than a written sentence and much better than nothing.
 */
export function explainRevert(cause: unknown, fallback: string): string {
  const named = cause as { name?: string; shortMessage?: string };

  // Not a failure. Somebody pressed reject, and telling them the transaction failed would
  // be reporting their own decision back to them as a problem.
  if (named?.name === "UserRejectedRequestError") return "You cancelled it.";

  if (cause instanceof BaseError) {
    const reverted = cause.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && reverted.data) {
      const written = fromRevert(reverted.data.errorName, reverted.data.args ?? []);
      if (written) return written;
    }
  }

  return named?.shortMessage ?? fallback;
}
