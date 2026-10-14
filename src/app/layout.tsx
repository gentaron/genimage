import type { Metadata, Viewport } from "next";
import { Dela_Gothic_One, Yomogi } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the thumbnail fonts come from this site and
// the service worker can keep them for offline use. The canvas reads the
// generated family names through these CSS variables.
const head = Dela_Gothic_One({ weight: "400", subsets: ["latin"], variable: "--font-thumb-head", display: "swap" });
const hand = Yomogi({ weight: "400", subsets: ["latin"], variable: "--font-thumb-hand", display: "swap" });

export const metadata: Metadata = {
  title: "Eureka Thumb",
  description: "文章を貼るだけで、文字だけの派手なブログサムネ(1280×670)を作るツール。",
  applicationName: "Eureka Thumb",
  appleWebApp: { capable: true, title: "Eureka Thumb", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0d14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${head.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
