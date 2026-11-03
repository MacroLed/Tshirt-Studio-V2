import { describe, expect, it } from 'vitest';
import { copyName, exportFileName, MAX_PROJECT_NAME_LENGTH, normalizeProjectName } from '@/core/design/projectName';

describe('nazwa projektu', () => {
  it('porządkuje odstępy', () => {
    expect(normalizeProjectName('  Moja   koszulka ')).toBe('Moja koszulka');
  });

  it('odrzuca pustą nazwę', () => {
    expect(normalizeProjectName('')).toBeNull();
    expect(normalizeProjectName('   \t\n')).toBeNull();
  });

  it('skraca do limitu bez rozcinania emoji', () => {
    const long = normalizeProjectName('a'.repeat(100))!;
    expect(long).toHaveLength(MAX_PROJECT_NAME_LENGTH);
    const emoji = normalizeProjectName('😀'.repeat(100))!;
    expect([...emoji]).toHaveLength(MAX_PROJECT_NAME_LENGTH);
    expect(emoji.endsWith('😀')).toBe(true);
  });
});

describe('nazwa kopii', () => {
  it('dokłada dopisek tylko raz', () => {
    expect(copyName('Bluza')).toBe('Bluza (kopia)');
    expect(copyName('Bluza (kopia)')).toBe('Bluza (kopia)');
  });

  it('mieści się w limicie', () => {
    const name = copyName('a'.repeat(MAX_PROJECT_NAME_LENGTH));
    expect(name.length).toBeLessThanOrEqual(MAX_PROJECT_NAME_LENGTH);
    expect(name.endsWith(' (kopia)')).toBe(true);
  });
});

describe('nazwa pobieranego pliku', () => {
  it('usuwa polskie znaki i odstępy', () => {
    expect(exportFileName('Żółta łódź', 'Lewy rękaw')).toBe('zolta-lodz-lewy-rekaw.png');
  });

  it('usuwa znaki zabronione i próby wyjścia z katalogu', () => {
    expect(exportFileName('../../etc/pass:wd*?', 'Przód')).toBe('etc-pass-wd-przod.png');
  });

  it('zapewnia nazwę, gdy nic nie zostało', () => {
    expect(exportFileName('😀 ???', 'widok 3d')).toBe('projekt-widok-3d.png');
  });
});
