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
  icons: { icon: "/icon", shortcut: "/icon", apple: "/icon" },
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
    <html lang="en">
      <body className={manrope.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
