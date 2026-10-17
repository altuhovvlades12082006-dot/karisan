import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kari-San — постільна білизна",
  description: "Домашній текстиль Kari-San",
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
    <html lang="uk">
      <body className="antialiased">{children}</body>
    </html>
  );
}
