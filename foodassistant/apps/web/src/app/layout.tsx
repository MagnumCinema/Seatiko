import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./premium.css";
import { LocaleProvider } from "@/components/locale-provider";

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FoodAssistant — пилот Бельцы",
  description:
    "Презентация FoodAssistant и кабинет ресторанов. Гостевое приложение — Android.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#0f1410] text-[#f3efe6] antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
