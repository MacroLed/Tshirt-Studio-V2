import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

/** Adresy tego komputera w sieci lokalnej, odczytywane na bieżąco, bo router może je zmieniać. */
const localNetworkAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => address!.address);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tylko serwer deweloperski: test z telefonu w tej samej sieci lokalnej. Nie wpływa na wersję produkcyjną.
  allowedDevOrigins: localNetworkAddresses,
};

export default nextConfig;
