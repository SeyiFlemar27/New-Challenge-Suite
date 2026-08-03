import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { brandConfig } from "@/lib/brand-config";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.challengesuite.com"),
  title: { default: "Challenge Suite", template: "%s | Challenge Suite" },
  description: brandConfig.description,
  alternates: { canonical: "/" },
  manifest: brandConfig.manifest,
  icons: {
    icon: [{ url: brandConfig.logo.faviconSvg, type: "image/svg+xml" }, { url: brandConfig.logo.favicon, sizes: "any" }, { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    shortcut: brandConfig.logo.favicon,
    apple: [{ url: brandConfig.logo.appleTouchIcon, sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    type: "website",
    url: "https://www.challengesuite.com",
    siteName: "Challenge Suite",
    title: "Challenge Suite",
    description: "Competition, made intentional.",
    images: [{ url: brandConfig.logo.socialCard, width: 1200, height: 630, alt: brandConfig.name }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Challenge Suite",
    description: "Competition, made intentional.",
    images: [brandConfig.logo.socialCard]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-app-theme="light" data-app-theme-preference="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('challenge-suite-appearance');if(t!=='light'&&t!=='dark'&&t!=='system')t='light';var r=t==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;document.documentElement.dataset.appThemePreference=t;document.documentElement.dataset.appTheme=r}catch(e){}})();` }} />
      </head>
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
