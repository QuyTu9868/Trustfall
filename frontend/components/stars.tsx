/** A read-only 1-to-5 star rating, shared by every place a review gets shown. */
export function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? "text-ink-strong" : "text-line"}>
          ★
        </span>
      ))}
    </span>
  );
}
