import "./globals.css";
import { Providers } from "./providers";
import { AppNav } from "@/components/app-nav";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <Providers>
          <AppNav />

          <div className="max-w-4xl mx-auto p-4">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
