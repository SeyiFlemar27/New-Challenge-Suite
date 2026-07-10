import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/landing", "/subscriptions", "/challenges", "/leaderboards", "/privacy", "/terms", "/community-guidelines", "/refund-policy", "/cookie-policy", "/contact", "/about"];
  return routes.map((route) => ({
    url: `https://www.challengesuite.com${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/challenges" || route === "/leaderboards" ? "daily" : "monthly",
    priority: route === "" || route === "/landing" ? 1 : 0.7
  }));
}
