import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "./providers";
import { Topbar } from "@/components/lattice/topbar";
import { Footer } from "@/components/lattice/footer";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Avalanche Explorer",
  description: "Block explorer for Avalanche L1s",
};

// Mobile viewport contract — `viewportFit: "cover"` extends the layout
// under iOS notch / home indicator, which is then padded back in via
// `env(safe-area-inset-*)` on the body in globals.css. The themeColor
// `media` array form lets the OS browser chrome track the active theme
// (cream in light, near-black in dark) instead of showing a default
// safari-grey stripe at the top.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0a" },
  ],
};

const themeBootstrap = `
(function(){
  try {
    var t = localStorage.getItem('explorer:theme');
    if (!t) {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${inter.variable} ${jetbrains.variable} antialiased`}
      suppressHydrationWarning
    >
      {/* Body is the natural scroll container — Topbar uses position: sticky
          to pin to the top of the viewport, which only works when the
          ancestor scroll context is the document itself. */}
      <body className="bg-bg text-ink">
        {/* Theme bootstrap runs before hydration so dark mode applies on
            first paint with no flash. next/script's beforeInteractive
            strategy is the Next 16-blessed way to inline a <script>
            without tripping the "scripts inside React components" guard. */}
        <Script
          id="theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrap }}
        />
        <Providers>
          <Topbar />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
