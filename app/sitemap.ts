import type { MetadataRoute } from "next";
import { PUBLIC_CATEGORIES } from "@/lib/public-site/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/for-talent", "/explore", "/subscriptions", "/challenges", "/leaderboards", "/privacy", "/terms", "/community-guidelines", "/refund-policy", "/cookie-policy", "/contact", "/about", ...PUBLIC_CATEGORIES.map((category) => `/categories/${category.slug}`)];
  return routes.map((route) => ({
    url: `https://www.challengesuite.com${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/explore" || route === "/challenges" || route.startsWith("/categories/") ? "daily" : "monthly",
    priority: route === "" ? 1 : route === "/for-talent" || route === "/explore" ? 0.9 : 0.7
  }));
}
