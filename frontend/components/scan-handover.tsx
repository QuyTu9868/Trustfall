"use client";

import { useIdentityToken } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { announce } from "@/lib/announce";
import { targetChain } from "@/lib/chain";
import { explainRevert } from "@/lib/contract-errors";
import { escrowAbi, escrowAddress } from "@/lib/escrow";
import { type HandoverAction, decodeHandover } from "@/lib/handover";
import { useNetworkReady } from "@/lib/use-network-ready";

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
};

/**
 * The scanning side. Reads the other party's code and submits the transaction.
 *
 * Camera first where the browser has a barcode reader built in, which covers Chrome on a
 * phone and is the real world flow. Everything else falls back to pasting the text, and
 * so does demoing on a single laptop, where there is no second camera to point at
 * anything. A flow that only works with two devices is a flow that fails on stage.
 */
export function ScanHandover({
  action,
  onDone,
  onClose,
}: {
  action: HandoverAction;
  onDone: () => void;
  onClose: () => void;
}) {
  const config = useConfig();
  const { identityToken } = useIdentityToken();
  const { ensureReady } = useNetworkReady();
  const video = useRef<HTMLVideoElement>(null);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const cameraSupported =
    typeof window !== "undefined" && "BarcodeDetector" in window;

  async function submit(raw: string) {
    setError(null);
    const code = decodeHandover(raw);
    if (!code) {
      setError("That does not look like a handover code.");
      return;
    }
    if (code.action !== action) {
      setError(
        `That is a ${code.action === "checkIn" ? "check-in" : "check-out"} code, not the one needed here.`
      );
      return;
    }
    if (!escrowAddress) {
      setError("The escrow is not deployed on this network.");
      return;
    }
    if (!(await ensureReady())) return;

    setStatus("sending");
    try {
      const hash = await writeContract(config, {
        address: escrowAddress,
        abi: escrowAbi,
        functionName: action,
        chainId: targetChain.id,
        args: [BigInt(code.rentalId), BigInt(code.deadline), code.signature],
      });
      await waitForTransactionReceipt(config, { hash, chainId: targetChain.id });
      // The person who scanned already knows. This is for the one who showed the code.
      await announce(
        BigInt(code.rentalId),
        action === "checkIn" ? "checked-in" : "checked-out",
        identityToken ?? undefined
      );
      onDone();
    } catch (cause) {
      // The two reverts this screen actually produces, SignatureExpired and BadSignature,
      // both mean "get a fresh code", and neither said so before.
      setError(explainRevert(cause, "That code was rejected."));
    } finally {
      setStatus("idle");
    }
  }

  // Poll the camera for a code. Stops as soon as one is found, or when the panel closes.
  useEffect(() => {
    if (!scanning || !cameraSupported) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector })
          .BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });

        const look = async () => {
          if (stopped || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              stopped = true;
              setScanning(false);
              await submit(found[0].rawValue);
              return;
            }
          } catch {
            // A frame that fails to decode is normal, just try the next one.
          }
          timer = window.setTimeout(look, 400);
        };
        look();
      } catch {
        setError("Could not open the camera. Paste the code instead.");
        setScanning(false);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // submit is stable enough for this panel's lifetime and re-running would restart the
    // camera on every keystroke in the paste box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, cameraSupported]);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-canvas p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base">
          {action === "checkIn" ? "Collect the item" : "Take the item back"}
        </h3>
        <button onClick={onClose} className="text-xs text-ink-muted underline">
          Close
        </button>
      </div>

      {scanning ? (
        <video ref={video} className="w-full rounded-card border border-line" muted />
      ) : (
        cameraSupported && (
          <button
            onClick={() => setScanning(true)}
            className="w-fit rounded-control border border-line bg-surface px-3 py-1.5 text-sm"
          >
            Scan with the camera
          </button>
        )
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs text-ink-muted">
          {cameraSupported ? "Or paste the code" : "Paste the code"}
        </span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
          className="tabular w-full rounded-control border border-line bg-surface p-2 text-[10px]"
        />
      </label>

      <button
        onClick={() => submit(pasted)}
        disabled={status === "sending" || !pasted.trim()}
        className="w-fit rounded-control bg-ink-strong px-4 py-2 text-sm text-canvas disabled:opacity-50"
      >
        {status === "sending" ? "Sending..." : "Submit the code"}
      </button>

      {error && <p className="text-xs text-stop-ink">{error}</p>}
    </div>
  );
}
