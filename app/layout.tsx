import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://why-lab-gpt-astra.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "WhyLab — Investigate the failure. Prove the why.",
  description:
    "Let Astra investigate why your ML model failed, then repair the policy and prove what changed.",
  openGraph: {
    title: "WhyLab — Investigate the failure. Prove the why.",
    description:
      "Evidence-linked diagnosis, measurable repair, and a retained re-test.",
    type: "website",
    url: siteUrl,
    siteName: "WhyLab",
    images: [
      {
        url: "/launch/whylab-thumbnail.png",
        width: 1270,
        height: 760,
        alt: "WhyLab evidence-linked ML investigation",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WhyLab — Investigate the failure. Prove the why.",
    description:
      "Evidence-linked diagnosis, measurable repair, and a retained re-test.",
    images: ["/launch/whylab-thumbnail.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}