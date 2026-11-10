import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from '../lib/i18n.mjs';
export const metadata: Metadata = { title: 'Monalisa Café — مقهى موناليزا', description: 'تسيير المقهى بكل وضوح · Votre café, en toute clarté.' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ar" dir="rtl" suppressHydrationWarning><body><LanguageProvider>{children}</LanguageProvider></body></html>; }
