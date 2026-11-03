import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  reporter: 'list',
  // Programowy WebGL obciąża cały procesor, więc sceny 3D testujemy po kolei.
  workers: 1,
  timeout: 60_000,
  // Programowe GPU potrafi na kilka sekund zablokować stronę przy wysyłaniu tekstur, czego prawdziwa karta nie robi.
  // Domyślne 5 s było na granicy, przez co wynik testów zależał od obciążenia komputera.
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3100',
    // Programowy WebGL: testy nie zależą od karty graficznej komputera.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
