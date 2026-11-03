/**
 * Identyfikator elementu lub projektu. `crypto.randomUUID` istnieje tylko na HTTPS i localhost, a edytor
 * ma działać także przy teście z telefonu pod adresem w sieci lokalnej, gdzie dostępne są tylko losowe bajty.
 */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Znaczniki wersji 4 i wariantu zgodne ze standardem UUID.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
