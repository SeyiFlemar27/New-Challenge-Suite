import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/landing", "/subscriptions", "/challenges", "/leaderboards", "/privacy", "/terms", "/community-guidelines", "/refund-policy", "/cookie-policy", "/contact", "/about"],
      disallow: ["/api/", "/admin/", "/dashboard", "/wallet", "/settings", "/favorites", "/my-entries", "/my-challenges", "/host/", "/sponsor/dashboard"]
    },
    sitemap: "https://www.challengesuite.com/sitemap.xml"
  };
}
