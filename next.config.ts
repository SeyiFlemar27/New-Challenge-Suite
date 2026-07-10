import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/auth/sign-in", destination: "/auth/login", permanent: false },
      { source: "/private", destination: "/private-exclusive", permanent: false },
      { source: "/live", destination: "/live-events", permanent: false }
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "images.unsplash.com" }
    ]
  }
};

export default nextConfig;
