// Paste this into the custom_code filter on the Latch dashboard, language javascript.
//
// The one rule here that the declarative filters cannot express.
//
// The server already refuses to sign below 0.6 confidence, and that bar is the same for
// every verdict. This raises it for one of them. refund_renter and split both leave the
// renter holding something; pay_owner is the agent taking the entire deposit off them, and
// it is the only outcome where being wrong costs somebody everything they put up.
//
// So the bar scales with the damage. The agent may be fairly sure and still move money, but
// to take all of it, it has to be almost certain. That is the authority Trustfall delegated
// to it, written down in the one place the agent cannot edit.
//
// Note what this does NOT do: it never lowers a bar, never names an amount, and never picks
// a winner. A verdict that gets past here still has to survive the server reading the rental
// back off the chain, and the contract still works out every figure itself.

if (ctx.body.verdict === "pay_owner") {
  var confidence = Number(ctx.body.confidence);

  // Unreadable counts as not confident. An arbitrator that cannot say how sure it is has
  // not cleared a bar, and reading a missing number as a passing one is how the bar stops
  // being a bar.
  if (!isFinite(confidence)) {
    return deny("pay_owner was proposed without a readable confidence.");
  }

  if (confidence < 0.9) {
    return deny(
      "Taking the whole deposit needs 0.9 confidence and this verdict has " +
        confidence.toFixed(2) +
        ". Trustfall lets the agent split a deposit on its own judgement, not empty one."
    );
  }
}

return allow();
