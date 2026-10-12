import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/insightflow/auth-context';
import { AppShell } from '@/components/insightflow/app-shell';

export const metadata: Metadata = {
  title: 'InsightFlow — From Customer Noise to Confident Decisions',
  description: 'Evidence-first customer-feedback decision platform for Build Battle 2026',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 font-sans antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
