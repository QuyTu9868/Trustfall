/**
 * One photo in a fixed frame, shown whole.
 *
 * object-contain rather than object-cover on purpose. Cover fills the frame and crops
 * whatever does not fit, which is fine for a browse grid where tidy rows matter more than
 * detail, but wrong everywhere here: on these screens the whole point is checking the
 * photo you are about to publish, and a cropped preview hides exactly what you came to
 * look at. The letterboxing is the honest result.
 */
export function Photo({
  src,
  alt,
  lazy = false,
}: {
  src: string;
  alt: string;
  lazy?: boolean;
}) {
  return (
    <div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-card border border-line bg-canvas">
      {/* Blob URLs for local previews and Supabase URLs for published listings. next/image
          needs the remote host allowlisted and adds nothing for a blob, so it waits for
          the browse grid in checkpoint 5. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={lazy ? "lazy" : undefined}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
