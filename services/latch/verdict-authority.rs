// Paste into the custom_code filter on the Latch dashboard. The language is Rust, not
// JavaScript: Latch compiles this to WASM and runs it inside the enclave, and the editor
// says "compiled - runs verified" once it builds.
//
// The body runs inside:
//     pub fn on_request(ctx: &RequestContext) -> PolicyResult { ... }
//
// The one rule here that the declarative filters cannot express.
//
// The server already refuses to sign below 0.6 confidence, and it applies that bar to all
// three verdicts. That is the wrong shape, because the three outcomes do not cost the same
// when they are wrong. refund_renter and split both leave the renter holding something.
// pay_owner takes the entire deposit off them, and it is the only ruling where being wrong
// costs somebody everything they put up.
//
// So the bar scales with the damage. The agent may be fairly sure and still move money, but
// to take all of it, it has to be almost certain. That is the authority Trustfall delegated
// to it, written in the one place the agent cannot edit.
//
// Note what this does not do: it never lowers a bar, never names an amount, and never picks
// a winner. A verdict that gets past here still has to survive the server reading the rental
// back off the chain, and the contract still works out every figure itself.

// Absent on the listing route, which has no verdict at all, so that route falls straight
// through to allow() without needing a when clause to exclude it.
let verdict = ctx.body_field("verdict").unwrap_or_default();
if verdict != "pay_owner" {
    return PolicyResult::allow();
}

// Missing or unreadable counts as not confident. An arbitrator that cannot say how sure it
// is has not cleared a bar, and reading a missing number as a passing one is how a bar stops
// being a bar. -1.0 is below every threshold, so both failures land on deny.
let confidence: f64 = ctx
    .body_field("confidence")
    .unwrap_or_default()
    .parse()
    .unwrap_or(-1.0);

if confidence < 0.9 {
    return PolicyResult::deny(
        "Taking the whole deposit needs 0.9 confidence. Trustfall lets the agent split a \
         deposit on its own judgement, not empty one.",
    );
}

PolicyResult::allow()
