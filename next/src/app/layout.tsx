import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import StytchProviderClient from "@/components/StytchProviderClient";
import Header from '@/components/Header'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <StytchProviderClient>
          <div className="min-h-screen font-[family-name:var(--font-geist-sans)] bg-contain bg-center bg-fixed bg-no-repeat" 
               style={{ 
                 backgroundImage: 'url("/originalevan_simple_digital_icon_of_the_golden_gate_bridge_--_0f9cbc8b-0951-450d-ae37-143e8f76c577_0.svg")', 
                 backgroundSize: '95vh',
                 backgroundPosition: 'center'
               }}>
            <div className="min-h-screen bg-white/30">
              <Header />
              {children}
            </div>
          </div>
        </StytchProviderClient>
      </body>
    </html>
  );
}
