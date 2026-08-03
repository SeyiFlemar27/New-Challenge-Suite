export const CHALLENGE_SUITE_LOGO_URL =
  "https://res.cloudinary.com/drefcs4o2/image/upload/v1785709128/challenge-suite-logo-transparent_oq72ds.png";

export const brandConfig = {
  name: "Challenge Suite",
  shortName: "Challenge Suite",
  description:
    "A global competition, challenge, tournament, live event, voting, prediction, and creator monetization platform.",
  homeHref: "/",
  logo: {
    primary: CHALLENGE_SUITE_LOGO_URL,
    local: "/brand/challenge-suite-logo.png",
    favicon: "/favicon.ico",
    faviconSvg: "/favicon.svg",
    appleTouchIcon: "/apple-touch-icon.png",
    socialCard: "/brand/challenge-suite-social-card.png"
  },
  manifest: "/manifest.webmanifest",
  colors: {
    gold: "#d4af37",
    background: "#ffffff"
  }
} as const;
