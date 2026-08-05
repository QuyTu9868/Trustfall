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

/** What each outcome does to the deposit, in the words somebody losing would read. */
export const OUTCOME: Record<Verdict["verdict"], string> = {
  refund_renter: "deposit to the renter",
  split: "deposit split",
  pay_owner: "deposit to the owner",
};
