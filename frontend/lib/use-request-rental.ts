"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useState } from "react";
import { useAccount, useConfig } from "wagmi";
import {
  getBlock,
  readContract,
  signTypedData,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { announce } from "./announce";
import { targetChain } from "./chain";
import { escrowAbi, escrowAddress, usdcAbi, usdcAddress } from "./escrow";
import { useNetworkReady } from "./use-network-ready";

/** How long the renter's approval signature stays good for. */
const PERMIT_WINDOW_SECONDS = 30 * 60;

export type RequestArgs = {
  listingId: `0x${string}`;
  owner: `0x${string}`;
  pricePerDay: bigint;
  deposit: bigint;
  startDate: bigint;
  endDate: bigint;
  /** Rent plus deposit: what the escrow will pull. */
  total: bigint;
};

/**
 * Requests a rental in one wallet signature plus one transaction.
 *
 * Without the permit this is two popups: approve the token, then request. CLAUDE.md
 * section 9 is blunt that every extra popup loses people, and the first one is the worst
 * place to lose them. The permit is signed off chain, costs no gas, and rides along with
 * the request.
 */
export function useRequestRental() {
  const { identityToken } = useIdentityToken();
  const config = useConfig();
  const { address } = useAccount();
  const { ensureReady, error: networkError, clearError } = useNetworkReady();

  const [step, setStep] = useState<"idle" | "signing" | "sending" | "confirming">("idle");
  const [error, setError] = useState<string | null>(null);

  async function request(args: RequestArgs): Promise<bigint | null> {
    setError(null);
    clearError();

    if (!escrowAddress || !usdcAddress) {
      setError("The escrow is not deployed on this network yet.");
      return null;
    }
    // Held locally so the narrowing survives into the callbacks below.
    const escrow = escrowAddress;
    const usdc = usdcAddress;
    // Signed in and on the right chain. Checked here so the wallet is never asked to
    // sign something that is going to fail on arrival.
    if (!(await ensureReady()) || !address) return null;

    try {
      // Balance first, before any popup. Being told you are short after signing wastes
      // the one bit of attention people give a wallet prompt.
      const balance = (await readContract(config, {
        address: usdc,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [address],
        chainId: targetChain.id,
      })) as bigint;

      if (balance < args.total) {
        const short = Number(args.total - balance) / 1e6;
        setError(`Not enough USDC. You need ${short.toFixed(2)} more.`);
        return null;
      }

      setStep("signing");

      // The token's own EIP-712 domain, read from the token rather than hardcoded, so a
      // different USDC deployment cannot silently invalidate every signature.
      const domain = (await readContract(config, {
        address: usdc,
        abi: usdcAbi,
        functionName: "eip712Domain",
        chainId: targetChain.id,
      })) as [string, string, string, bigint, `0x${string}`, `0x${string}`, bigint[]];

      const nonce = (await readContract(config, {
        address: usdc,
        abi: usdcAbi,
        functionName: "nonces",
        args: [address],
        chainId: targetChain.id,
      })) as bigint;

      // Counted from the chain's clock, not this machine's. The contract compares the
      // deadline against block.timestamp, so a signature dated by the browser is dated by
      // the wrong clock: on a local chain wound forward it is already three days stale
      // before it is sent, and on a real network anybody whose computer is off by an hour
      // has the same problem.
      //
      // What that looked like was not a clock error at all. The permit reverted as
      // expired, the catch below swallowed it, and the failure surfaced as the transfer
      // finding an allowance of zero.
      const chainNow = await getBlock(config, { chainId: targetChain.id });
      const deadline = chainNow.timestamp + BigInt(PERMIT_WINDOW_SECONDS);

      const signature = await signTypedData(config, {
        domain: {
          name: domain[1],
          version: domain[2],
          chainId: targetChain.id,
          verifyingContract: usdc,
        },
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
          owner: address,
          spender: escrow,
          value: args.total,
          nonce,
          deadline,
        },
      });

      const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
      const v = Number.parseInt(signature.slice(130, 132), 16);

      setStep("sending");
      const hash = await writeContract(config, {
        address: escrow,
        abi: escrowAbi,
        functionName: "requestRentalWithPermit",
        chainId: targetChain.id,
        args: [
          args.listingId,
          args.owner,
          args.pricePerDay,
          args.deposit,
          args.startDate,
          args.endDate,
          deadline,
          v,
          r,
          s,
        ],
      });

      setStep("confirming");
      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: targetChain.id,
      });

      // The id comes from the RentalRequested event. It is indexed, so it sits in the
      // first topic after the event signature.
      const log = receipt.logs.find(
        (entry) => entry.address.toLowerCase() === escrow.toLowerCase()
      );
      const id = log?.topics[1] ? BigInt(log.topics[1]) : null;

      // The owner is the one person in this flow who is not looking at a screen, and a
      // request nobody accepts earns nobody anything. This is the notification that
      // CLAUDE.md singles out for an email as well as a bell.
      if (id !== null) await announce(id, "requested", identityToken ?? undefined);

      return id;
    } catch (cause) {
      setError(readableError(cause));
      return null;
    } finally {
      setStep("idle");
    }
  }

  return { request, step, error: error ?? networkError, busy: step !== "idle" };
}

/**
 * viem puts a one line summary on shortMessage and a wall of hex on message. A rejection
 * gets its own wording, because the default reads like something went wrong.
 */
function readableError(cause: unknown) {
  if (typeof cause === "object" && cause !== null) {
    const err = cause as { name?: string; shortMessage?: string; message?: string };
    if (err.name === "UserRejectedRequestError") return "You cancelled the signature.";
    if (err.shortMessage) return err.shortMessage;
    if (err.message) return err.message.split("\n")[0];
  }
  return "Could not send the request.";
}
