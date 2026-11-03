import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from '@/core/design/createId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('identyfikatory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('korzysta z funkcji przeglądarki, gdy jest dostępna', () => {
    expect(createId()).toMatch(UUID_V4);
  });

  it('poza HTTPS tworzy poprawne i niepowtarzalne identyfikatory', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = new Set(Array.from({ length: 2000 }, () => createId()));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
