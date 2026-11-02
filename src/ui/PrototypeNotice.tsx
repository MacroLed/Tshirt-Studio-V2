/** Wyraźne oznaczenie treści tymczasowych, zgodnie z zasadami pracy nad projektem. */
export function PrototypeNotice({ children }: { children: string }) {
  return (
    <p className="border border-line px-3 py-2 text-xs text-muted" role="note">
      <span className="font-semibold text-ink">Prototyp. </span>
      {children}
    </p>
  );
}
