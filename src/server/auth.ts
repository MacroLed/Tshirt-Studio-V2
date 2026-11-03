import { assertRole, type CurrentUser } from '@/core/account/session';

/**
 * TYMCZASOWO konta nie istnieją, więc nikt nie jest zalogowany. Taki stan jest bezpieczny:
 * wszystko, co wymaga użytkownika lub administratora, odmawia dostępu, zamiast przepuszczać.
 * Podłączenie logowania zmienia tylko tę funkcję: docs/ETAP-4-SERWER.md.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  return null;
}

export async function requireUser(): Promise<CurrentUser> {
  return assertRole(await getCurrentUser());
}

export async function requireAdmin(): Promise<CurrentUser> {
  return assertRole(await getCurrentUser(), 'admin');
}
