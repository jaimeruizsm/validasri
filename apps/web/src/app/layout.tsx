import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { APP_NAME } from '@validasri/shared';
import './globals.css';

export const metadata: Metadata = {
  title: `${APP_NAME} — Validacion de comprobantes del SRI`,
  description:
    'Validacion masiva de comprobantes electronicos del SRI de Ecuador a partir de un archivo TXT.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
