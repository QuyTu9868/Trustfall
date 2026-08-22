/**
 * The shapes the two admin screens read, and the words they both use.
 *
 * Shared because the list and the detail page have to agree about what a verdict means. If
 * the list said "applied" where the detail said "held back", the one somebody believed
 * would be whichever they happened to open first.
 */
export type Verdict = {
  onchain_rental_id: number;
  verdict: "refund_renter" | "split" | "pay_owner";
  confidence: number;
  reason: string;
  signed: boolean;
  tx_hash: string | null;
  held_back_reason: string | null;
  model: string;
  evidence_seen: string;
  findings: { from: string; says: string }[];
  created_at: string;
  /** Null when the arbitrator's own ruling stands. Set only where a person had to step in. */
  settled_by: "admin" | null;
  settled_note: string | null;
  /**
   * What happened between the agent proposing this and the server acting on it.
   *
   * Null on anything ruled before this was tracked: those proposals did go through the
   * same hop, but nothing recorded which of the three this was, and guessing one now would
   * be inventing evidence on the page built to be checked.
   */
  gateway: "passed" | "blocked" | "direct" | null;
  gateway_note: string | null;
};

export type Filed = {
  side: "owner" | "renter";
  statement: string;
  image_url: string | null;
  created_at: string;
};

export type ChatLine = {
  sender_address: string;
  body: string;
  created_at: string;
};

/** A photograph taken at check-in or check-out, unconditionally, dispute or not. */
export type Handover = {
  phase: "checkin" | "checkout";
  note: string | null;
  image_url: string | null;
  created_at: string;
};

/** A dispute that has been filed but not yet judged: the arbitrator is still reading it. */
export type Pending = {
  onchain_rental_id: number;
  filed_at: string;
};

/** A listing the checker looked at, and what it made of it. */
export type Check = {
  id: number;
  listing_id: string | null;
  title: string | null;
  decision: "approve" | "reject";
  reasons: string[];
  findings: { from: string; says: string }[];
  model: string;
  created_at: string;
};

/** The listing itself, as the checker was given it. */
export type ListingRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  price_per_day: string;
  deposit: string;
  status: string;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
};

/**
 * What the gateway hop did to a proposal, in words a reader who has never heard of Latch
 * can still follow.
 */
export const GATEWAY_LABEL: Record<NonNullable<Verdict["gateway"]>, string> = {
  passed: "cleared by policy",
  blocked: "refused by policy",
  direct: "no gateway configured",
};

/** What each outcome does to the deposit, in the words somebody losing would read. */
export const OUTCOME: Record<Verdict["verdict"], string> = {
  refund_renter: "deposit to the renter",
  split: "deposit split",
  pay_owner: "deposit to the owner",
};

/**
 * The two figures the contract emitted while moving the deposit, or null when there is
 * nothing to read: a ruling that was held back, or a node that would not answer.
 *
 * Kept beside the verdict rather than folded into it, because one is a decision somebody
 * made and the other is what a chain recorded, and a reader is entitled to see which is
 * which.
 */
export type Settled = { toRenter: string; toOwner: string; total: string } | null;

/**
 * When the rent was settled, which is not when the deposit was.
 *
 * Rent leaves escrow the moment a rental stops being Active, so a dispute opened during the
 * rental settles it there and one opened after the item came back settled it at check-out.
 * Either way it is already gone by the time the arbitrator rules, and the figures below are
 * the deposit alone. Without this line the two numbers read as the whole of the money.
 */
export const DEPOSIT_ONLY =
  "The deposit only. Rent left escrow earlier, when the rental stopped being active.";
