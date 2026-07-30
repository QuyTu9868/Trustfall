/**
 * Placeholder for a route that exists so the nav has no dead links, but whose screen
 * belongs to a later checkpoint. Says which one, so nobody has to guess whether it is
 * unfinished or broken.
 */
export function ComingSoon({
  title,
  checkpoint,
  what,
}: {
  title: string;
  checkpoint: number;
  what: string;
}) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl">{title}</h1>
      <p className="max-w-xl text-sm text-ink-muted">{what}</p>
      <p className="text-xs text-ink-muted">Built in checkpoint {checkpoint}.</p>
    </main>
  );
}
