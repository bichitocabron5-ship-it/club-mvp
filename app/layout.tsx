import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <nav className="bg-gray-900 text-white p-4">
          <div className="max-w-4xl mx-auto flex gap-4">
            <Link href="/" className="font-bold">
              Club MVP
            </Link>

            <Link href="/access">Acceso</Link>
            <Link href="/sales">Retiradas</Link>
            <Link href="/cash">Caja</Link>
            <Link href="/products">Productos</Link>
            <Link href="/stock">Stock</Link>
            <Link href="/members">Socios</Link>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto p-4">{children}</div>
      </body>
    </html>
  );
}