import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
