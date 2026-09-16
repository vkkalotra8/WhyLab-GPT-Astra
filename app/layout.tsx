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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: "WhyLab — Investigate the failure. Prove the why.",
  description:
    "Let Astra investigate why your ML model failed, then repair the policy and prove what changed.",
  openGraph: {
    title: "WhyLab — Investigate the failure. Prove the why.",
    description:
      "Evidence-linked diagnosis, measurable repair, and a retained re-test.",
    type: "website",
    images: [
      {
        url: "/launch/whylab-thumbnail.svg",
        width: 1270,
        height: 760,
        alt: "WhyLab evidence-linked ML investigation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WhyLab — Investigate the failure. Prove the why.",
    description:
      "Evidence-linked diagnosis, measurable repair, and a retained re-test.",
    images: ["/launch/whylab-thumbnail.svg"],
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