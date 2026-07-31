import Image from "next/image";

/**
 * One photo in a fixed frame.
 *
 * `fit` decides between two jobs. "contain" shows the whole picture and is what the
 * listing flow and the detail page need, where the point is looking at the item. "cover"
 * fills the frame and crops, which is what a browse grid needs, where rows of equal tidy
 * cards matter more than seeing every corner.
 *
 * Seeded placeholders are SVG, and next/image refuses to optimise SVG unless
 * dangerouslyAllowSVG is switched on. Turning that on app-wide to serve throwaway
 * placeholder art would be a bad trade, so SVGs pass through unoptimised and real
 * photographs get the full treatment. Uploads cannot be SVG anyway: lib/listing.ts only
 * accepts JPG, PNG and WebP.
 */
export function Photo({
  src,
  alt,
  fit = "contain",
  sizes = "(max-width: 768px) 100vw, 33vw",
  priority = false,
}: {
  src: string;
  alt: string;
  fit?: "contain" | "cover";
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className="relative aspect-4/3 overflow-hidden rounded-card border border-line bg-canvas">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={src.endsWith(".svg")}
        className={fit === "cover" ? "object-cover" : "object-contain"}
      />
    </div>
  );
}

/**
 * Local previews of files the user just picked, before anything is uploaded.
 * These are blob: URLs, which next/image cannot process, so they stay a plain img.
 */
export function LocalPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-card border border-line bg-canvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
