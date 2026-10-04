import type { Metadata } from "next";
import "./globals.css";
import "./play-layout.css";

export const metadata: Metadata = {
  title: "UNO CLUB · 四人牌桌",
  description: "四人在线与同屏牌局：经典 UNO、UNO FLIP 与 UNO FLEX。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
