import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Private Chat',
  description: 'A privacy-first AI chat app powered by Ollama. All conversations run locally on your machine.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
