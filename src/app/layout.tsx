import "./globals.css";
import type { Metadata } from "next";
import { Libre_Baskerville, Manrope } from "next/font/google";

const libre = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-libre"
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope"
});

export const metadata: Metadata = {
  title: "JCI Uncertainty Index",
  description: "Monthly uncertainty index dashboard and newsletter automation"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${libre.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
