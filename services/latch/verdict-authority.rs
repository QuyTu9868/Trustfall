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
//
// Everything goes through format! first, and that is the whole trick.
//
// body_field returns a JSON value, not a string. Three guesses at its type each compiled
// into something that never matched, or did not compile at all: != against a bare
// "pay_owner", .trim(), .parse(). The one operation proved to work on it was format!, from
// a throwaway policy that denied with the value it had read:
//
//     plain=["pay_owner"]   dollar=[null]
//
// Which answered both questions at once. Keys are bare, so a $. path returns null even
// though the payload filter one panel away demands exactly that syntax. And the value comes
// out JSON-serialised, so a string keeps its quotes. That is why the early versions let
// everything past: they compared "pay_owner" against pay_owner, and a comparison that is
// always false reads precisely like a gate that is always open.
//
// After format! it is an ordinary String, and everything below is plain Rust that does not
// depend on an API with no documentation.
let verdict = format!("{}", ctx.body_field("verdict").unwrap_or_default());
if verdict != "\"pay_owner\"" {
    return PolicyResult::allow();
}

// Missing or unreadable counts as not confident. An arbitrator that cannot say how sure it
// is has not cleared a bar, and reading a missing number as a passing one is how a bar stops
// being a bar. -1.0 is below every threshold, so both failures land on deny.
// Numbers serialise bare, so this parses. Anything that does not parse lands on -1.0 and
// denies, which is the only direction worth defaulting to when the question is whether to
// empty somebody's deposit.
let confidence: f64 = format!("{}", ctx.body_field("confidence").unwrap_or_default()).parse().unwrap_or(-1.0);

// One line, no continuation. A backslash-wrapped string is correct Rust and it is also the
// kind of thing that arrives mangled after a trip through a chat window and an editor, and
// this file exists to be copied.
if confidence < 0.9 {
    return PolicyResult::deny("Taking the whole deposit needs 0.9 confidence. Trustfall lets the agent split a deposit on its own judgement, not empty one.");
}

PolicyResult::allow()
