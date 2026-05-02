import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Node Contour Engine — Runtime GLSL Graph Compiler",
  description:
    "A browser-native GLSL compiler that takes a typed node graph as input and emits optimized WebGL2 shader programs in real time — with ping-pong framebuffers for temporal effects and strict DAG validation.",
  keywords: [
    "WebGL2",
    "GLSL",
    "shader",
    "node graph",
    "procedural",
    "contour",
    "real-time",
    "DAG",
    "framebuffer",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
