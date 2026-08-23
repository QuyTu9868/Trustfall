"use client";

import { useEffect, useState } from "react";

/**
 * A photo that opens full size on click. Built for /admin, where every photo is evidence
 * somebody has to actually look at, and the thumbnail is too small to read a scratch by.
 *
 * The backdrop is literal black rather than a theme token: a photo viewer stays dark
 * regardless of light or dark mode, the same way any camera app or gallery does.
 */
export function ZoomablePhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`cursor-zoom-in ${className ?? ""}`}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-card object-contain" />
        </div>
      )}
    </>
  );
}
