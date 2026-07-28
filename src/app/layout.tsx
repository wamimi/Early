import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { EarlyAuthProvider } from "@/components/early-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Early | Proof of discovery for the internet",
  description: "Turn the things you discovered before the crowd into verifiable, privacy-conscious proof.",
  icons: {
    icon: "/early-logo.svg",
    apple: "/early-logo.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body><EarlyAuthProvider>{children}</EarlyAuthProvider></body>
    </html>
  );
}
