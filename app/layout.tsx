import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VEYRA",
  description:
    "The operating system for made-to-order built environments — CRM, quotation, projects, procurement and production for the Indian interior & furniture industry.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
