import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { TelemetryServiceProviderBridge } from "@/components/providers/TelemetryServiceProviderBridge";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NetVis — National Network Telemetry & Anomaly Visualizer",
  description: "Production-grade network telemetry visualizer with Dijkstra & Bellman-Ford routing engines, real-time anomaly detection, and interactive topology graph.",
  keywords: ["NetVis", "network telemetry", "anomaly detection", "Dijkstra", "Bellman-Ford", "React Flow"],
  authors: [{ name: "NetVis Engineering" }],
  openGraph: {
    title: "NetVis — Network Telemetry & Anomaly Visualizer",
    description: "Interactive topology graph with routing algorithms and real-time anomaly detection",
    siteName: "NetVis",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <TelemetryServiceProviderBridge>
          {children}
        </TelemetryServiceProviderBridge>
        <Toaster />
      </body>
    </html>
  );
}
