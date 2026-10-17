import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Daily — Stay curious. Stay current.",
  description:
    "A source-backed daily AI learning quiz. Five topics, ten questions, two independent tracks.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
