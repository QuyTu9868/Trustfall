/**
 * The QR handover, on both sides.
 *
 * One party shows a code, the other scans it and sends the transaction. That split is the
 * point: at check-in the owner signs and the renter submits, so an owner cannot collect
 * rent without handing the item over; at check-out it is the other way round.
 *
 * What the code carries is a signature with a short deadline and the rental's current
 * nonce. A photograph of yesterday's screen is worthless, and either party can bump the
 * nonce to kill a code they showed and thought better of.
 */
export const HANDOVER_WINDOW_SECONDS = 10 * 60;

export type HandoverAction = "checkIn" | "checkOut";

export type HandoverCode = {
  v: 1;
  action: HandoverAction;
  rentalId: string;
  deadline: string;
  signature: `0x${string}`;
};

export function encodeHandover(code: HandoverCode) {
  return JSON.stringify(code);
}

/** Returns null rather than throwing: a mistyped paste is a user event, not a crash. */
export function decodeHandover(raw: string): HandoverCode | null {
  try {
    const parsed = JSON.parse(raw.trim());
    if (
      parsed?.v !== 1 ||
      (parsed.action !== "checkIn" && parsed.action !== "checkOut") ||
      typeof parsed.rentalId !== "string" ||
      typeof parsed.deadline !== "string" ||
      typeof parsed.signature !== "string" ||
      !parsed.signature.startsWith("0x")
    ) {
      return null;
    }
    return parsed as HandoverCode;
  } catch {
    return null;
  }
}

/** The EIP-712 types the contract checks against, mirroring CHECK_IN/CHECK_OUT_TYPEHASH. */
export const HANDOVER_TYPES = {
  checkIn: {
    CheckIn: [
      { name: "rentalId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  checkOut: {
    CheckOut: [
      { name: "rentalId", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
} as const;

export const HANDOVER_PRIMARY = {
  checkIn: "CheckIn",
  checkOut: "CheckOut",
} as const;
