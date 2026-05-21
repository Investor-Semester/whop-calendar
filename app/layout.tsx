import type { Metadata } from "next";
import { WhopIframeSdkProvider } from "@whop/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calendar",
  description: "Community event calendar powered by Whop",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <WhopIframeSdkProvider>{children}</WhopIframeSdkProvider>
      </body>
    </html>
  );
}
