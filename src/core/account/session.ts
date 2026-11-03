/** Tożsamość użytkownika niezależna od dostawcy logowania. Role są zgodne z tabelą `profiles` z ARCHITECTURE.md. */

export type UserRole = 'customer' | 'admin';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/** Brak zalogowanego użytkownika albo brak wymaganych uprawnień. */
export class AccessDeniedError extends Error {
  constructor(readonly reason: 'unauthenticated' | 'forbidden') {
    super(reason === 'unauthenticated' ? 'Wymagane logowanie' : 'Brak uprawnień');
    this.name = 'AccessDeniedError';
  }
}

/** Sprawdza uprawnienia na podstawie już odczytanego użytkownika; czysta logika do testów i serwera. */
export function assertRole(user: CurrentUser | null, role?: UserRole): CurrentUser {
  if (!user) throw new AccessDeniedError('unauthenticated');
  if (role && user.role !== role) throw new AccessDeniedError('forbidden');
  return user;
}
