/**
 * Builds three real rentals on Sepolia, argues over each one, and lets the arbitrator rule.
 * Everything goes through production: the deployed contracts, the live Latch policy, and
 * the signing route on Vercel.
 *
 * Made for looking at rather than for asserting. The suites in cp9 and cp10 prove the
 * agents decide correctly against fixed inputs; this one produces the thing a person opens
 * /admin to read, on real rentals, with real signatures and real money moving.
 *
 * The three cases are chosen to land on three different outcomes, because a log where
 * every row says the same thing proves nothing about whether the arbitrator is reading.
 *
 * Uses the wallets in .env.test so the rentals also show up in the app under the accounts
 * the user signs in with. Their keys are read, never printed.
 */
import { readFile } from "node:fs/promises";
import { Jimp } from "jimp";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  escrowAbi,
  escrowAddress,
  listingIdToBytes32,
  toRental,
  usdcAbi,
  usdcAddress,
  type RentalTuple,
} from "../lib/escrow";
import { HANDOVER_PRIMARY, HANDOVER_TYPES } from "../lib/handover";
import { resolveDispute } from "../lib/resolve-dispute";
import { moderateListing } from "../lib/moderation";
import {
  DISPUTE_EVIDENCE_BUCKET,
  LISTING_IMAGE_BUCKET,
  getSupabaseAdmin,
} from "../lib/supabase-server";

const RPC = process.env.SEPOLIA_RPC_URL;
const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });

/**
 * Runs against Sepolia, which changes two things about how this script can be written.
 *
 * The clock cannot be moved. evm_increaseTime was how the local version got a rental to be
 * over before checking out, and there is no such lever on a real network. It turns out not
 * to be needed: a dispute can be opened from Active as well as from Returned, so the two
 * arguments worth showing are reachable by choosing when to stop rather than by skipping
 * ahead. That is also closer to what actually happens, since most people who are going to
 * argue start before the rental is over.
 *
 * And every transaction is real. Roughly a dozen per case, each waiting on a block, so this
 * takes minutes rather than seconds and the wallets need funding first.
 */
const PROXY = "https://onlatch.com/proxy";

type Case = {
  title: string;
  category: "house" | "vehicle" | "clothing";
  description: string;
  pricePerDay: string;
  deposit: string;
  ownerSays: string;
  renterSays: string;
  chat: { from: "owner" | "renter"; body: string }[];
  expect: string;
  /** What each side's photograph shows, so the two disagree the way real ones do. */
  photos?: { owner: Shot; renter: Shot };
  /** What the pair taken at the two handovers shows. This is the evidence that decides. */
  handover?: { checkin: Shot; checkout: Shot };
  /**
   * The photograph the listing advertises, taken from public/landing.
   *
   * Real ones here, unlike the evidence below. What was advertised is the oldest thing the
   * arbitrator is handed and it is supposed to look like an advertisement, so a drawn panel
   * would be the one part of the record that announces itself as invented.
   */
  photo: "vehicles" | "homes" | "clothing" | `file:${string}`;
  /**
   * Days from now to start the rental. Zero for every fresh listing, since nothing has
   * ever booked it. A reused listing can have days already locked forever by an earlier
   * run of this same script - the contract never frees a day once booked, deliberately
   * left that way - so a case naming existingListing picks something comfortably clear of
   * whatever an earlier attempt on the same listing might have taken.
   */
  startOffsetDays?: number;
  /**
   * Where the argument starts.
   *
   * "active" opens the dispute straight after check-in, while the renter still has the
   * thing. "returned" runs the full handover both ways first and argues afterwards. The
   * contract allows both, the app offers both, and they read differently in the log: one
   * has a check-out photograph to weigh and the other does not.
   */
  flow: "active" | "returned";
  /**
   * Reuse a listing that is already published instead of making another one.
   *
   * Matched by title. For arguing over something the user posted through the app
   * themselves, where inventing a second copy of it would leave two of the same thing on
   * the marketplace and only one of them attached to the dispute anybody reads about.
   */
  existingListing?: string;
  /**
   * Roughly where it is collected, in the shape the publish form produces.
   *
   * Written here rather than left null because this script inserts listings straight into
   * the table, going around the form and its required field. A seeded listing with no area
   * would be the only kind anybody could publish without one, and the demo would be four
   * listings that all quietly lack the block a real one has.
   */
  pickupArea: string;
};

/**
 * A panel, with or without a gouge across it.
 *
 * Drawn rather than photographed because the point is that the two sides file pictures that
 * disagree, and a pair of stock photos would either both look fine or both look broken. A
 * dark diagonal on a flat panel is something a model can describe without being told, which
 * is what makes a finding attributed to a photograph checkable.
 */
async function panel(kind: "damaged" | "clean") {
  const width = 640;
  const height = 420;
  const image = new Jimp({ width, height, color: 0xb9c0c7ff });

  // A seam and a wheel arch, so it reads as a body panel rather than as a grey rectangle.
  for (let x = 40; x < width - 40; x++) image.setPixelColor(0x8f979eff, x, 300);
  for (let angle = 200; angle <= 340; angle++) {
    const radians = (angle * Math.PI) / 180;
    const cx = 470;
    const cy = 360;
    for (let r = 78; r < 82; r++) {
      const x = Math.round(cx + r * Math.cos(radians));
      const y = Math.round(cy + r * Math.sin(radians));
      if (x >= 0 && x < width && y >= 0 && y < height) image.setPixelColor(0x6b7278ff, x, y);
    }
  }

  if (kind === "damaged") {
    // Thick enough to survive the resize a model does before it looks at anything.
    for (let t = 0; t < 260; t++) {
      const x = 150 + t;
      const y = 120 + Math.round(t * 0.45);
      for (let w = -3; w <= 3; w++) image.setPixelColor(0x2b2f33ff, x, y + w);
    }
  }

  return Buffer.from(await image.getBuffer("image/jpeg", { quality: 80 }));
}

/**
 * What a piece of evidence is, either drawn here or a real photograph on disk.
 *
 * Drawn panels are right when the case needs two sides to file pictures that disagree and
 * nothing in stock does that on demand. A real photograph is better whenever one exists,
 * because the arbitrator is being asked to describe what it sees and a photograph of an
 * actual broken headlight is a harder thing to describe convincingly than a grey rectangle
 * with a line on it. Anything starting file: is read from image_test.
 */
type Shot = "damaged" | "clean" | `file:${string}`;

async function shot(spec: Shot) {
  if (!spec.startsWith("file:")) return panel(spec as "damaged" | "clean");
  return readFile(new URL(`../../image_test/${spec.slice(5)}`, import.meta.url));
}

const CASES: Case[] = [
  // Three cases, three outcomes: a clean renter win, a clean owner win, and a genuine
  // split. Earlier rounds of this file covered refund_renter and pay_owner several times
  // over but never actually landed split - the one attempt at it was built to be
  // ambiguous and the live model still called it for the renter. This set narrows to one
  // case per theme in image_test and puts the real design effort into the hotel case
  // actually earning a split rather than hoping for one.
  {
    title: "Civic Type R",
    category: "vehicle",
    description: "Boost Blue, manual, stock. Weekend hire only.",
    pricePerDay: "100",
    deposit: "500",
    ownerSays:
      "He gave it back late in the evening and I think there is a scratch on the side panel. I want the deposit.",
    renterSays:
      "I returned it at 6pm as we agreed, in the same condition. He looked it over and said it was fine, then messaged about a scratch two days later.",
    chat: [
      { from: "renter", body: "Just parked it downstairs, keys with the guard." },
      { from: "owner", body: "Got it, looks fine, thanks. Nice doing business." },
      { from: "owner", body: "Actually hold on, is that a scratch on the side? I only noticed now." },
    ],
    expect: "deposit back to the renter",
    // The owner claims a scratch and files a photograph of an unmarked panel. Both
    // photographs agree with the renter, which is the case worth being able to see.
    photos: { owner: "file:Civic/civic_1.jpg", renter: "file:Civic/civic_1.jpg" },
    // Unmarked at both handovers, so the scratch the owner describes was never there.
    handover: { checkin: "file:Civic/civic_1.jpg", checkout: "file:Civic/civic_1.jpg" },
    photo: "file:Civic/civic_1.jpg",
    flow: "returned",
    pickupArea: "Phường Thanh Bình, Quận Hải Châu, Thành phố Đà Nẵng",
  },
  {
    title: "Wool blazer, size 46",
    category: "clothing",
    description: "Single button, notch lapel, white pocket square. Dry cleaned before every hire.",
    pricePerDay: "28",
    deposit: "35",
    ownerSays:
      "There is a tear along the shoulder seam. It was not there when I handed it over, I check every jacket before it goes out.",
    renterSays:
      "It caught on something at the venue and the shoulder seam opened. I am sorry. It is one seam and a tailor can close it.",
    chat: [
      { from: "renter", body: "Bad news, the jacket caught on something tonight and the shoulder seam has opened." },
      { from: "owner", body: "How big? That jacket is lined, a seam there is not a five minute job." },
      { from: "renter", body: "About ten centimetres. I will pay for the repair." },
    ],
    expect: "the owner keeps the deposit",
    photos: { owner: "file:ao/ao_rachvai.png", renter: "file:ao/ao_rachvai.png" },
    // Clean going out and marked coming back, which is the pair doing its whole job.
    handover: { checkin: "file:ao/vest.png", checkout: "file:ao/ao_rachvai.png" },
    photo: "file:ao/vest.png",
    flow: "returned",
    pickupArea: "Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh",
  },
  {
    // Second attempt at split, on a different axis. The first tried to make severity
    // ambiguous and lost to a photograph that settled it anyway - a photograph is exactly
    // the kind of thing the arbitrator is told to trust over an assertion, so severity was
    // never going to stay ambiguous once one existed. This one leaves the damage itself
    // undisputed by both sides and photographed the same way by both, and puts the
    // disagreement somewhere no photograph can resolve it: a third party, the owner's own
    // cleaner, had the room to herself while neither party was there to see what happened.
    title: "Twin hotel room, Da Lat",
    category: "house",
    description: "Two single beds, en-suite bathroom, mountain view. Central location, walk to the lake.",
    pricePerDay: "35",
    deposit: "50",
    ownerSays:
      "The wall by the bed is scratched and the TV screen is cracked. Neither mark was there at check-in, and they had the only key for the whole stay. I want the deposit for the wall repair and a new screen.",
    renterSays:
      "Your cleaner let herself in on the second afternoon while we were out, you told us at check-in that might happen. We came back to a tidied room and did not look closely at the wall or the TV that day. Neither of us touched either of them.",
    chat: [
      { from: "renter", body: "Heading out to the lake for a few hours, is your cleaner still coming by like you mentioned at check-in?" },
      { from: "owner", body: "Yes, she will pop in around 2 to freshen the towels, will not take long." },
      { from: "renter", body: "The wall by the bed is scratched and the TV screen has a crack? Neither of us touched either of those, are you sure it was not already there." },
      { from: "owner", body: "It was fine when you checked in. And she has cleaned that room a hundred times without anything like this happening." },
      { from: "renter", body: "I am not saying it was her on purpose, just that she was in there alone and we were not." },
    ],
    expect: "split: the damage itself is not in dispute, but a third party with unsupervised access makes it unprovable which side answers for it",
    // Neither side denies either mark exists - both file the same photograph of it, which
    // is the point. The argument was never about what happened to the room, only about who
    // was in it when nobody else was watching.
    photos: { owner: "file:hotel/hotel_sofarach.png", renter: "file:hotel/hotel_sofarach.png" },
    // Clean at check-in; the crack is what the pair actually shows at check-out, real and
    // undisputed. The wall is argued from the same filed photograph rather than from a
    // second handover shot, since only one photograph is taken per handover.
    handover: { checkin: "file:hotel/nha-01-a.jpg", checkout: "file:hotel/hotel_tivihong.png" },
    photo: "file:hotel/nha-01-b.jpg",
    flow: "returned",
    pickupArea: "Phường 2, Thành phố Đà Lạt, Tỉnh Lâm Đồng",
  },
];

async function wait(hash: `0x${string}`, label: string) {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted`);
  return receipt;
}

async function main() {
  if (!escrowAddress || !usdcAddress) {
    throw new Error(
      `No addresses for chain ${sepolia.id} in lib/deployed.json. Check NEXT_PUBLIC_CHAIN_ID.`
    );
  }
  // Copied into locals because the check above does not narrow an imported binding inside
  // the closures below, and every call there would otherwise take an address of undefined.
  const escrow = escrowAddress;
  const usdc = usdcAddress;

  const ownerKey = process.env.Test_1;
  const renterKey = process.env.Test_2;
  if (!ownerKey || !renterKey) {
    throw new Error("Test_1 and Test_2 must be set. They live in .env.test at the repo root.");
  }

  // Out through the real gateway, not back at this machine.
  //
  // .env.local points LATCH_PROXY_URL at localhost, which is right for developing and wrong
  // for this: the whole value of seeding against production is that every proposal takes the
  // path a proposal takes in production, through the policy, with the credential attached by
  // Latch rather than by anything here. Overriding it in the script rather than editing the
  // file keeps the development default intact.
  if (!process.env.LATCH_API_KEY) {
    throw new Error("LATCH_API_KEY must be set, or the proposals never reach the gateway.");
  }
  process.env.LATCH_PROXY_URL = PROXY;

  const owner = privateKeyToAccount(ownerKey as `0x${string}`);
  const renter = privateKeyToAccount(renterKey as `0x${string}`);
  const ownerWallet = createWalletClient({ account: owner, chain: sepolia, transport: http(RPC) });
  const renterWallet = createWalletClient({ account: renter, chain: sepolia, transport: http(RPC) });
  const supabase = getSupabaseAdmin();

  console.log(`owner  ${owner.address}\nrenter ${renter.address}\n`);

  // One case at a time when a title is given, so a rerun does not spend a dozen real
  // transactions rebuilding rentals that already exist.
  // Exact match, not includes: "Civic Type R" is a substring of "Honda Civic Type R" and a
  // partial match here does not just pick the wrong case, it re-runs a listing that has
  // already been booked and reverts on the day collision - discovered live, the hard way.
  const only = process.argv[2];
  const chosen = only ? CASES.filter((c) => c.title === only) : CASES;
  if (!chosen.length) throw new Error(`No case matching "${only}".`);

  for (const item of chosen) {
    console.log(`\n=== ${item.title} ===`);

    // Reuse the one that is already on the marketplace, when the case names one. Posting a
    // second copy would leave two of the same thing on the page with only one of them
    // attached to the dispute anybody ends up reading.
    const existing = item.existingListing
      ? await supabase
          .from("listings")
          .select("id")
          .eq("title", item.existingListing)
          .limit(1)
          .maybeSingle()
      : null;
    if (item.existingListing && !existing?.data) {
      throw new Error(`No published listing titled "${item.existingListing}".`);
    }

    // The listing, published and already approved by the moderator. Running it through the
    // checker again would spend a request on a decision this script is not testing.
    const { data: listing, error } = existing?.data
      ? { data: existing.data, error: null }
      : await supabase
      .from("listings")
      .insert({
        owner_address: owner.address.toLowerCase(),
        category: item.category,
        title: item.title,
        description: item.description,
        pickup_area: item.pickupArea,
        price_per_day: item.pricePerDay,
        deposit: item.deposit,
        status: "published",
        moderation_status: "approved",
      })
      .select("id")
      .single();
    if (error || !listing) throw new Error(`listing insert failed: ${error?.message}`);

    // What the listing advertised, in the public bucket the app uses, so the arbitrator sees
    // it before anything that was filed afterwards. The same file twice: two angles would be
    // better and two photographs of the same thing is what a listing actually has.
    const reused = Boolean(existing?.data);
    const advert = item.photo.startsWith("file:")
      ? await readFile(new URL(`../../image_test/${item.photo.slice(5)}`, import.meta.url))
      : await readFile(new URL(`../public/landing/${item.photo}.jpg`, import.meta.url));
    for (const index of reused ? [] : [0, 1]) {
      const path = `${listing.id}/${index}.jpg`;
      const { error: imageError } = await supabase.storage
        .from(LISTING_IMAGE_BUCKET)
        .upload(path, advert, { contentType: "image/jpeg", upsert: true });
      if (imageError) throw new Error(`listing image failed: ${imageError.message}`);
      const { data: url } = supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path);
      const { error: rowError } = await supabase
        .from("listing_images")
        .insert({ listing_id: listing.id, url: url.publicUrl, sort_order: index });
      if (rowError) throw new Error(`listing image row failed: ${rowError.message}`);
    }

    // Through the real checker, so /admin gets a row for the listing as well as for the
    // dispute. Approved listings are logged too: a log of refusals only is a log that
    // cannot tell you the checker is passing everything.
    // A listing already on the marketplace was already checked. Running it again would put
    // a second row in the log for one listing and spend a model call to reach the same
    // answer.
    const check = reused ? null : await moderateListing({
      title: item.title,
      description: item.description,
      // The same file the listing shows, not a stand-in. A checker judged on one image and
      // a listing displaying another is a log that cannot be checked against the page.
      images: [`data:image/jpeg;base64,${advert.toString("base64")}`],
      listingId: listing.id,
    });
    if (check) console.log(`  listing check: ${check.decision}${check.reasons.length ? " - " + check.reasons.join(" | ") : ""}`);

    const price = parseUnits(item.pricePerDay, 6);
    const deposit = parseUnits(item.deposit, 6);

    // Read from the chain rather than from this machine. Sepolia keeps its own clock and
    // makes blocks on its own, so no nudge is needed here, but the permit deadline is
    // signed against whatever this number says and a local clock that drifts would produce
    // a deadline already expired on arrival. The permit then reverts inside the contract's
    // try and surfaces as ERC20InsufficientAllowance, which sends you hunting for a missing
    // approval that was never the problem.
    const chainNow = Number((await pub.getBlock()).timestamp);
    const start = chainNow + (item.startOffsetDays ?? 0) * 24 * 60 * 60;
    const total = price * 2n + deposit;

    // One signature for the money and one transaction for the request, same as the app.
    const permitDeadline = BigInt(chainNow + 3600);
    const nonce = (await pub.readContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "nonces",
      args: [renter.address],
    })) as bigint;
    const [, name, version] = (await pub.readContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "eip712Domain",
    })) as [string, string, string];

    const permit = await renterWallet.signTypedData({
      domain: { name, version, chainId: sepolia.id, verifyingContract: usdc },
      types: {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      primaryType: "Permit",
      message: {
        owner: renter.address,
        spender: escrow,
        value: total,
        nonce,
        deadline: permitDeadline,
      },
    });

    await wait(
      await renterWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "requestRentalWithPermit",
        args: [
          listingIdToBytes32(listing.id),
          owner.address,
          price,
          deposit,
          BigInt(start),
          BigInt(start + 2 * 24 * 60 * 60),
          permitDeadline,
          Number.parseInt(permit.slice(130, 132), 16),
          `0x${permit.slice(2, 66)}` as `0x${string}`,
          `0x${permit.slice(66, 130)}` as `0x${string}`,
        ],
      }),
      "requestRentalWithPermit"
    );

    const id =
      ((await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "nextRentalId",
      })) as bigint) - 1n;

    await wait(
      await ownerWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "approveRental",
        args: [id],
      }),
      "approveRental"
    );

    // Check-in: the owner signs the code, the renter is the one who sends it.
    const domain = { name: "Trustfall", version: "1", chainId: sepolia.id, verifyingContract: escrow };
    const handover = async (kind: "checkIn" | "checkOut") => {
      const handoverNonce = (await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "rentalNonce",
        args: [id],
      })) as bigint;
      const deadline = BigInt((await pub.getBlock()).timestamp) + 600n;
      // Whoever is handing the item over shows the code; the other one submits it.
      const signer = kind === "checkIn" ? ownerWallet : renterWallet;
      const sender = kind === "checkIn" ? renterWallet : ownerWallet;
      const message = { rentalId: id, nonce: handoverNonce, deadline };
      const signature =
        kind === "checkIn"
          ? await signer.signTypedData({
              domain,
              types: HANDOVER_TYPES.checkIn,
              primaryType: HANDOVER_PRIMARY.checkIn,
              message,
            })
          : await signer.signTypedData({
              domain,
              types: HANDOVER_TYPES.checkOut,
              primaryType: HANDOVER_PRIMARY.checkOut,
              message,
            });
      await wait(
        await sender.writeContract({
          address: escrow,
          abi: escrowAbi,
          functionName: kind,
          args: [id, deadline, signature],
        }),
        kind
      );
    };

    await handover("checkIn");
    // Only the rentals that are meant to have been handed back. The other kind argues while
    // the renter still holds the thing, which the contract allows from Active and which is
    // the more common way an argument actually starts.
    if (item.flow === "returned") await handover("checkOut");

    // The handover pair, written straight to the same place the route writes it. Taken
    // before either side knew there would be an argument, which is what makes it worth more
    // than anything filed afterwards.
    if (item.handover) {
      // A rental still in progress has no check-out photograph, because there has been no
      // check-out. Writing one anyway would hand the arbitrator evidence from an event that
      // never happened, and the log would show a finding citing it.
      const phases = item.flow === "returned" ? (["checkin", "checkout"] as const) : (["checkin"] as const);
      for (const phase of phases) {
        const path = `handover/${id}/${phase}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(DISPUTE_EVIDENCE_BUCKET)
          .upload(path, await shot(item.handover[phase]), {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (upErr) throw new Error(`handover upload failed: ${upErr.message}`);
        const { error: rowErr } = await supabase.from("handover_photos").insert({
          onchain_rental_id: Number(id),
          phase,
          image_path: path,
          uploaded_by: (phase === "checkin" ? renter.address : owner.address).toLowerCase(),
        });
        if (rowErr) throw new Error(`handover row failed: ${rowErr.message}`);
      }
    }

    await wait(
      await ownerWallet.writeContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "openDispute",
        args: [id],
      }),
      "openDispute"
    );

    const rental = toRental(
      id,
      (await pub.readContract({
        address: escrow,
        abi: escrowAbi,
        functionName: "rentals",
        args: [id],
      })) as RentalTuple
    );
    console.log(`  rental #${id} is ${rental.status}`);

    // The conversation happened during the rental, so it is written first and dated before
    // the statements. The arbitrator is told to weigh it more heavily for exactly that
    // reason, and dates that said otherwise would quietly undermine the instruction.
    if (item.chat.length) {
      const { error: chatError } = await supabase.from("messages").insert(
        item.chat.map((line, index) => ({
          onchain_rental_id: Number(id),
          sender_address: (line.from === "owner" ? owner.address : renter.address).toLowerCase(),
          body: line.body,
          created_at: new Date(Date.now() - (item.chat.length - index) * 3600_000).toISOString(),
        }))
      );
      if (chatError) throw new Error(`chat insert failed: ${chatError.message}`);
    }

    // Same bucket and the same {rentalId}/{side}.jpg path the real route writes, so what
    // the arbitrator loads here is loaded exactly the way it is in the app.
    const paths: Record<"owner" | "renter", string | null> = { owner: null, renter: null };
    if (item.photos) {
      for (const side of ["owner", "renter"] as const) {
        const path = `${id}/${side}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from(DISPUTE_EVIDENCE_BUCKET)
          .upload(path, await shot(item.photos[side]), {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (uploadError) throw new Error(`photo upload failed: ${uploadError.message}`);
        paths[side] = path;
      }
    }

    // Checked rather than assumed. An insert that fails here returns an error object and
    // carries on, and the first sign of it is the arbitrator saying nobody filed anything,
    // which reads like a bug in the arbitrator.
    const { error: evidenceError } = await supabase.from("dispute_evidence").insert([
      {
        onchain_rental_id: Number(id),
        side: "owner",
        author_address: owner.address.toLowerCase(),
        statement: item.ownerSays,
        image_path: paths.owner,
      },
      {
        onchain_rental_id: Number(id),
        side: "renter",
        author_address: renter.address.toLowerCase(),
        statement: item.renterSays,
        image_path: paths.renter,
      },
    ]);
    if (evidenceError) throw new Error(`evidence insert failed: ${evidenceError.message}`);

    console.log(`  expecting: ${item.expect}`);
    const ruling = await resolveDispute(id);
    console.log(
      `  got: ${ruling.verdict} at ${ruling.confidence.toFixed(2)}` +
        (ruling.signed ? `, applied ${ruling.txHash}` : `, held back: ${ruling.heldBack}`)
    );
    console.log(`  reason: ${ruling.reason}`);
  }

  console.log("\nDone. Open /admin to read the log.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
