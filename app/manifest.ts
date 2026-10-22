import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Royale Lens",
    short_name: "Royale Lens",
    description: "Inspect Clash Royale profiles, explore collections, and keep a personal upgrade plan synchronized across devices.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#070a16",
    theme_color: "#070a16",
    orientation: "any",
    categories: ["games", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
