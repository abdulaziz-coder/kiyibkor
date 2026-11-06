import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title: 'Kiyib Kor — Virtual kiyinish xonasi', description: 'Oʻzbekiston uchun virtual kiyinish xonasi. Kamera yoki rasmingiz orqali kiyimlarni sinab koʻring.'};
export default function Layout({children}: Readonly<{children: React.ReactNode}>) {return <html lang="uz"><body>{children}</body></html>}
