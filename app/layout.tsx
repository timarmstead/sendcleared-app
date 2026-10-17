import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
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
  title: "SendCleared — Email QA & Client Approval",
  description: "Flawless emails, one-click sign-off. SendCleared automatically checks your email campaigns for mistakes and gets clients to approve in one click.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Google Analytics is deliberately NOT loaded on pages whose URL contains
          a secret token (client approval links, team invites, password resets).
          Analytics records the full page address, so loading it there would send
          those tokens to Google. window.gtag stays undefined on these pages, and
          trackEvent() in lib/analytics.ts safely does nothing.
        */}
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            (function () {
              var p = window.location.pathname;
              var sensitive =
                p.indexOf('/r/') === 0 ||
                p.indexOf('/invite/') === 0 ||
                p.indexOf('/reset-password') === 0 ||
                p.indexOf('/auth') === 0 ||
                window.location.search.indexOf('invite=') !== -1;
              if (sensitive) return;

              window.dataLayer = window.dataLayer || [];
              window.gtag = function () { window.dataLayer.push(arguments); };
              window.gtag('js', new Date());
              window.gtag('config', 'G-DM2FNKGX61');

              var s = document.createElement('script');
              s.async = true;
              s.src = 'https://www.googletagmanager.com/gtag/js?id=G-DM2FNKGX61';
              document.head.appendChild(s);
            })();
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}