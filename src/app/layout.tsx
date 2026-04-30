import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perlin Contours | GLSL WebGL2",
  description: "Interactive GLSL Perlin noise contours rendered in real-time using WebGL2.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
