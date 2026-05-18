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

          <div className="app-shell">
            <div className="app-shell__inner">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
