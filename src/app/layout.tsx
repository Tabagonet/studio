import type { Metadata } from 'next';
import { PT_Sans, Source_Code_Pro } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { APP_NAME } from '@/lib/constants';
import { CookieBanner } from '@/components/core/cookie-banner';
import { cn } from '@/lib/utils';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-body',
});

const sourceCodePro = Source_Code_Pro({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-code',
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: `The AI-powered assistant for WooCommerce and WordPress content.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={cn(
          'font-body antialiased',
          ptSans.variable,
          sourceCodePro.variable
        )}
      >
        {children}
        <CookieBanner />
        <Toaster />
      </body>
    </html>
  );
}
