import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: ['.ai/**', '.claude/**', '.next/**', 'node_modules/**','assets-src/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'],
  },
  {
    // core/ to czysty TypeScript: musi działać w przeglądarce, na serwerze i w testach.
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'next', 'next/*', 'three', 'three/*', '@react-three/*'],
              message: 'core/ nie może zależeć od Reacta, Next.js ani three.',
            },
            {
              group: ['@/features/*', '@/app/*', '@/server/*', '@/three/*', '@/ui/*', '@/data/*'],
              message: 'core/ nie może importować warstw wyższych.',
            },
          ],
        },
      ],
    },
  },
  {
    // Sekcje aplikacji rozwijamy niezależnie, więc nie importują się nawzajem.
    files: ['src/features/rack/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/*', '!@/features/rack', '!@/features/rack/*'],
              message: 'Sekcje w features/ nie importują się nawzajem. Wspólny kod trafia do core/ lub ui/.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
