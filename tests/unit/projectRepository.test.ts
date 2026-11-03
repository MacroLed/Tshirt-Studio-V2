import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { assertRole, AccessDeniedError, type CurrentUser } from '@/core/account/session';
import { IndexedDbProjectRepository } from '@/features/studio/indexedDbProjectRepository';
import { requireAdmin, requireUser } from '@/server/auth';
import { describeProjectRepositoryContract } from './projectRepository.contract';

describeProjectRepositoryContract('IndexedDB', () => {
  // Każdy test zaczyna od pustej bazy.
  globalThis.indexedDB = new IDBFactory();
  return new IndexedDbProjectRepository();
});

describe('uprawnienia', () => {
  const customer: CurrentUser = { id: 'u', email: 'a@example.com', role: 'customer' };
  const admin: CurrentUser = { ...customer, role: 'admin' };

  it('rozróżnia brak logowania i brak uprawnień', () => {
    expect(() => assertRole(null)).toThrow(AccessDeniedError);
    expect(assertRole(customer)).toBe(customer);
    expect(assertRole(admin, 'admin')).toBe(admin);
    try {
      assertRole(customer, 'admin');
      expect.unreachable();
    } catch (error) {
      expect((error as AccessDeniedError).reason).toBe('forbidden');
    }
  });

  it('bez kont serwer odmawia dostępu, zamiast przepuszczać', async () => {
    await expect(requireUser()).rejects.toMatchObject({ reason: 'unauthenticated' });
    await expect(requireAdmin()).rejects.toMatchObject({ reason: 'unauthenticated' });
  });
});
