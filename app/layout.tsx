import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"]
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.challengesuite.com"),
  title: { default: "Challenge Suite", template: "%s | Challenge Suite" },
  description: "Create, enter, vote, and run structured challenges for competitors, creators, Hosts, and brands.",
  alternates: { canonical: "/" },
  manifest: "/site.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" }, { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    type: "website",
    url: "https://www.challengesuite.com",
    siteName: "Challenge Suite",
    title: "Challenge Suite",
    description: "Competition, made intentional."
  },
  twitter: {
    card: "summary_large_image",
    title: "Challenge Suite",
    description: "Competition, made intentional."
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
