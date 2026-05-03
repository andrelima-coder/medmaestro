import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Em dev, move .next para /tmp para escapar de Spotlight/iCloud/IDE
  // que podem deletar arquivos durante o build (causa ENOENT em rename .gz_)
  ...(process.env.NODE_ENV !== 'production' && process.env.NEXT_DIST_DIR
    ? { distDir: process.env.NEXT_DIST_DIR }
    : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
