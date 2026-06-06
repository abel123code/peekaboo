import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Peekaboo",
  description: "Codex-powered AEO workspace for answer-ready content workflows."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-6 max-md:px-4">{children}</main>
      </body>
    </html>
  );
}
