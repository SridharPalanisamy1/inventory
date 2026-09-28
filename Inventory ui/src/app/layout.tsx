import Providers from "./Providers";
import "../app/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>YEN ERP — Inventory</title>
        <meta
          name="description"
          content="YEN ERP Inventory Management — Warehouse & Outlet stock control"
        />
        {/* Inter + Source Sans 3 + Plus Jakarta Sans (ledger pages) — primary font stack */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>

      <body className="font-sans bg-surface-muted antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}