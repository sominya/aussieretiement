import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AussieRetire AI",
  description:
    "Australian retirement, superannuation, property, offset, and portfolio modelling.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
