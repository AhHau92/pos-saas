import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Phone POS";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Point of sale and inventory for mobile phone shops",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900">{children}</body>
    </html>
  );
}
