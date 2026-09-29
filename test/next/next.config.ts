import type { NextConfig } from 'next';

const config: NextConfig = {
  // Turbopack and webpack each keep a build folder of their own, so the two dev servers can run side by side.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // The repository's own lockfile above would make Turbopack take the repository for the app's root.
  turbopack: { root: __dirname },
};

export default config;
