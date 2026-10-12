import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import { Header } from "@/components/header";
import { DefaultPasswordBanner } from "@/components/account-menu";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: "PostPilot",
  description: "An AI agent drafts your school's social media posts. You decide what gets published.",
  icons: { icon: "/icon.svg" },
};

// viewport-fit=cover lets the phone tab bar sit above the home indicator
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <AppProvider>
          <Header />
          <main className="mx-auto max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8 md:pb-16">
            <DefaultPasswordBanner />
            {children}
          </main>
        </AppProvider>
      </body>
    </html>
  );
}
