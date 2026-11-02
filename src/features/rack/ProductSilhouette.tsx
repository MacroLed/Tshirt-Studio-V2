/**
 * TYMCZASOWA sylwetka dla listy produktów, dopóki w kroku 7 nie powstaną plakaty z renderów.
 * Dotyczy tylko listy rezerwowej: na wieszaku 3D koszulki są zawsze prawdziwymi modelami.
 */
export function ProductSilhouette({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" focusable="false">
      <path
        d="M36 12 C40 18 60 18 64 12 L72 15 L92 33 L81 45 L72 38 L72 90 Q50 93 28 90 L28 38 L19 45 L8 33 L28 15 Z"
        fill={color}
        stroke="#1a191733"
        strokeWidth="0.5"
      />
    </svg>
  );
}
