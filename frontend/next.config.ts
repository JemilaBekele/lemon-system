


import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'https://system.ordere.net', port: '5050', pathname: '/**' }
    ],
    unoptimized: true,
  },

};

export default nextConfig;
