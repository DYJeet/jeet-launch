import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { PUBLIC_BETA_READ_ONLY, PUBLIC_BETA_MESSAGE } from "@/lib/public-beta";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JeeT Launch | Fair Solana Launchpad",
  description: "Transparent Solana launches with launch integrity checks and fair-launch mechanics.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><Providers>{PUBLIC_BETA_READ_ONLY && <aside role="note" className="border-b border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">{PUBLIC_BETA_MESSAGE}</aside>}{children}</Providers></body>
    </html>
  );
}
