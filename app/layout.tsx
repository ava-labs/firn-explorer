import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "L1 Explorer",
  description: "Block explorer for Avalanche L1s",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="border-b">
            <nav className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6 text-sm">
              <Link href="/" className="font-semibold">
                L1 Explorer
              </Link>
              <Link href="/blocks" className="text-muted-foreground hover:text-foreground">
                Blocks
              </Link>
              <Link
                href="/transactions"
                className="text-muted-foreground hover:text-foreground"
              >
                Transactions
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl px-4 py-8 flex-1">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
