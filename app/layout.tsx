"use client";

import "./globals.css";
import { Inter } from "next/font/google";
import { ReactNode, useEffect } from "react";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("bg-slate-950", "text-slate-100");
  }, []);

  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
