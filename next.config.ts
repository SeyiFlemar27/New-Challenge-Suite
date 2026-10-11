import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate local browser E2E output so it cannot collide with another
  // development server or the repository's regular .next build artifacts.
  distDir: process.env.CHALLENGE_SUITE_NEXT_DIST_DIR || ".next",
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
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "res.cloudinary.com" }
    ]
  }
};

export default nextConfig;
