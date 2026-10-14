import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eureka Thumb",
  description: "文章を貼るだけで、文字だけの派手なブログサムネ(1280×670)を作るツール。",
};

export const viewport: Viewport = {
  themeColor: "#0b0d14",
  width: "device-width",
  initialScale: 1,
};

// The canvas draws with these families, so they are loaded as plain
// stylesheets the browser can pull glyph subsets from on demand.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Yomogi&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
