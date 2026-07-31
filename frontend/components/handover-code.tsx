"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useConfig } from "wagmi";
import { readContract, signTypedData } from "wagmi/actions";
import { targetChain } from "@/lib/chain";
import { escrowAbi, escrowAddress } from "@/lib/escrow";
import {
  HANDOVER_PRIMARY,
  HANDOVER_TYPES,
  HANDOVER_WINDOW_SECONDS,
  type HandoverAction,
  encodeHandover,
} from "@/lib/handover";

/**
 * The showing side. Signs the handover off chain and draws it as a QR code.
 *
 * Signing costs no gas and sends nothing: it is a permission slip. The other party is the
 * one who submits it, which is what makes the handover mutual rather than one sided.
 */
export function ShowHandoverCode({
  rentalId,
  action,
  onClose,
}: {
  rentalId: bigint;
  action: HandoverAction;
  onClose: () => void;
}) {
  const config = useConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [left, setLeft] = useState(HANDOVER_WINDOW_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  async function sign() {
    if (!escrowAddress) return;
    setError(null);
    setSigning(true);
    try {
      const nonce = (await readContract(config, {
        address: escrowAddress,
        abi: escrowAbi,
        functionName: "rentalNonce",
        args: [rentalId],
        chainId: targetChain.id,
      })) as bigint;

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + HANDOVER_WINDOW_SECONDS
      );

      // Cast because primaryType is chosen at runtime, and viem's types are built to
      // infer it from a literal. The shape is checked against the contract by the tests
      // in RentalEscrow.t.sol, which rebuild this same digest and would fail if it drifted.
      const signature = await signTypedData(config, {
        domain: {
          name: "Trustfall",
          version: "1",
          chainId: targetChain.id,
          verifyingContract: escrowAddress,
        },
        types: HANDOVER_TYPES[action],
        primaryType: HANDOVER_PRIMARY[action],
        message: { rentalId, nonce, deadline },
      } as unknown as Parameters<typeof signTypedData>[1]);

      setPayload(
        encodeHandover({
          v: 1,
          action,
          rentalId: rentalId.toString(),
          deadline: deadline.toString(),
          signature,
        })
      );
      setExpiresAt(Number(deadline));
    } catch (cause) {
      setError(
        (cause as { shortMessage?: string })?.shortMessage ?? "Could not sign the code."
      );
    } finally {
      setSigning(false);
    }
  }

  // Draw once there is something to draw.
  useEffect(() => {
    if (payload && canvas.current) {
      QRCode.toCanvas(canvas.current, payload, { width: 240, margin: 1 }).catch(() =>
        setError("Could not draw the code. Use the text below instead.")
      );
    }
  }, [payload]);

  // A visible countdown, because a code that quietly stops working is worse than one
  // that says how long it has left.
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Math.max(0, expiresAt - Math.floor(Date.now() / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-canvas p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base">
          {action === "checkIn" ? "Hand the item over" : "Confirm it came back"}
        </h3>
        <button onClick={onClose} className="text-xs text-ink-muted underline">
          Close
        </button>
      </div>

      {!payload ? (
        <>
          <p className="text-sm text-ink-muted">
            {action === "checkIn"
              ? "Sign a code for the renter to scan when you hand the item over. Signing costs nothing and sends nothing: they are the one who submits it."
              : "Sign a code for the owner to scan when you give the item back."}
          </p>
          <button
            onClick={sign}
            disabled={signing}
            className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {signing ? "Sign in your wallet..." : "Create the code"}
          </button>
        </>
      ) : (
        <>
          <canvas ref={canvas} className="self-center rounded-card bg-white" />
          <p className="text-center text-xs text-ink-muted">
            {left > 0 ? (
              <>
                Good for{" "}
                <span className="tabular">
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </span>
              </>
            ) : (
              "Expired. Create a new one."
            )}
          </p>

          {/* The paste path. Demoing on one laptop means there is no second camera, and
              a flow that only works with two devices is a flow that fails on stage. */}
          <details className="text-xs">
            <summary className="cursor-pointer text-ink-muted">
              No camera? Copy the code instead
            </summary>
            <textarea
              readOnly
              value={payload}
              onFocus={(e) => e.currentTarget.select()}
              className="tabular mt-2 h-24 w-full rounded-control border border-line bg-surface p-2 text-[10px]"
            />
          </details>
        </>
      )}

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </div>
  );
}
