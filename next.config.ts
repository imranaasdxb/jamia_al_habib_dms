import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Reuse visited pages in the browser; protected server responses remain dynamic.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default nextConfig;
