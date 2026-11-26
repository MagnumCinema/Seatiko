import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Button System · Seatiko Dev",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DevButtonsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
