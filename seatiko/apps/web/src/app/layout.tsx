import type { Metadata, Viewport } from "next";
import { Inter, Manrope, Fraunces } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./premium.css";
import { CurrencyProvider } from "@/components/currency-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeProvider } from "@/components/theme-provider";

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Seatiko · Bălți",
  description:
    "Seatiko — free tables in real time, live floor plans and online table booking in Bălți restaurants.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${sans.variable} ${display.variable} ${inter.variable} h-full`}
      data-theme="dark"
    >
      <body className="min-h-full flex flex-col antialiased site-body">
        <LocaleProvider>
          <CurrencyProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </CurrencyProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
