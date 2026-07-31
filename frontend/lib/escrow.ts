import type { Abi } from "viem";
import escrowAbiJson from "./escrow-abi.json" with { type: "json" };
import usdcAbiJson from "./usdc-abi.json" with { type: "json" };
import deployed from "./deployed.json" with { type: "json" };
import { targetChain } from "./chain";

/**
 * The escrow, as the frontend sees it.
 *
 * Both ABIs are written by contracts/scripts/deploy.js at deploy time rather than copied
 * here by hand, so a contract change cannot leave a stale signature behind in the app.
 */
// JSON loses literal types on import: "function" widens to string, which is not an Abi
// as far as viem is concerned. The shape is right, it is only the narrowing that is lost,
// so this asserts what the file already contains rather than papering over a mismatch.
export const escrowAbi = escrowAbiJson as Abi;
export const usdcAbi = usdcAbiJson as Abi;

type Addresses = Record<
  string,
  { mockUSDC?: string; rentalEscrow?: string; treasury?: string; agent?: string } | undefined
>;

function addressFor(key: "mockUSDC" | "rentalEscrow") {
  const value = (deployed as Addresses)[String(targetChain.id)]?.[key];
  return value ? (value as `0x${string}`) : undefined;
}

export const escrowAddress = addressFor("rentalEscrow");
export const usdcAddress = addressFor("mockUSDC");

export const USDC_DECIMALS = 6;

/**
 * Mirrors the Status enum in RentalEscrow. Order matters: these are the on-chain numbers,
 * and the contract only ever appends, so an index never changes meaning.
 */
export const STATUS = [
  "None",
  "Requested",
  "Approved",
  "Active",
  "Returned",
  "Completed",
  "Cancelled",
  "Disputed",
] as const;

export type Status = (typeof STATUS)[number];

/** The five steps UI-REFERENCE.md section 3 asks to be drawn as a horizontal strip. */
export const STATUS_STRIP = [
  "Requested",
  "Approved",
  "Active",
  "Returned",
  "Completed",
] as const;

export const STATUS_LABEL: Record<Status, string> = {
  None: "Unknown",
  Requested: "Requested",
  Approved: "Approved",
  Active: "In use",
  Returned: "Returned",
  Completed: "Completed",
  Cancelled: "Cancelled",
  Disputed: "Disputed",
};

/** Pastel pairs from globals.css, one per state, so colour always means something. */
export const STATUS_TONE: Record<Status, string> = {
  None: "bg-canvas text-ink-muted",
  Requested: "bg-pend-bg text-pend-ink",
  Approved: "bg-okay-bg text-okay-ink",
  Active: "bg-live-bg text-live-ink",
  Returned: "bg-canvas text-ink border border-line",
  Completed: "bg-live-bg text-live-ink",
  Cancelled: "bg-stop-bg text-stop-ink",
  Disputed: "bg-stop-bg text-stop-ink",
};

/** The shape the public `rentals(id)` getter returns, in order. */
export type RentalTuple = readonly [
  `0x${string}`, // listingId
  `0x${string}`, // owner
  `0x${string}`, // renter
  bigint, // pricePerDay
  bigint, // rent, the allowance
  bigint, // deposit
  bigint, // startDate
  bigint, // endDate
  bigint, // checkedInAt
  bigint, // returnedAt
  bigint, // disputedAt
  number, // status
];

export type Rental = {
  id: bigint;
  listingId: `0x${string}`;
  owner: `0x${string}`;
  renter: `0x${string}`;
  pricePerDay: bigint;
  rent: bigint;
  deposit: bigint;
  startDate: bigint;
  endDate: bigint;
  checkedInAt: bigint;
  returnedAt: bigint;
  disputedAt: bigint;
  status: Status;
};

export function toRental(id: bigint, tuple: RentalTuple): Rental {
  return {
    id,
    listingId: tuple[0],
    owner: tuple[1],
    renter: tuple[2],
    pricePerDay: tuple[3],
    rent: tuple[4],
    deposit: tuple[5],
    startDate: tuple[6],
    endDate: tuple[7],
    checkedInAt: tuple[8],
    returnedAt: tuple[9],
    disputedAt: tuple[10],
    status: STATUS[tuple[11]] ?? "None",
  };
}

/**
 * Supabase listing ids are uuids, the contract stores bytes32. Strip the dashes and pad,
 * which is reversible, so a rental can always be matched back to its listing row.
 */
export function listingIdToBytes32(uuid: string): `0x${string}` {
  return `0x${uuid.replace(/-/g, "").padEnd(64, "0")}`;
}

export function bytes32ToListingId(value: string): string {
  const hex = value.replace(/^0x/, "").slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** Midnight UTC of an ISO date, which is what the contract's day maths expects. */
export function isoDateToTimestamp(value: string): bigint {
  const [y, m, d] = value.split("-").map(Number);
  return BigInt(Math.floor(Date.UTC(y, m - 1, d) / 1000));
}
