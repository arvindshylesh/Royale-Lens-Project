import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Royale Lens — Clash Royale Tracker",
  description: "Inspect Clash Royale profiles, explore collections, and keep a personal upgrade plan synchronized across devices.",
  applicationName: "Royale Lens",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#070a16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: "#070a16" }}>
      <head>
        <script
          id="google-identity-services"
          src="https://accounts.google.com/gsi/client"
          async
          defer
        />
      </head>
      <body className="antialiased" style={{ backgroundColor: "#070a16" }}>{children}</body>
    </html>
  );
}
