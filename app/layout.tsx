import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Laser Treat Esthetica | Shared Clinic App",
  description: "Simple shared clinic booking database."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c5a46f"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
