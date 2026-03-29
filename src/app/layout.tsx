import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Urbindex — US City Intelligence Platform',
  description: 'Explore every US city through data. Demographics, economy, housing, climate, safety, education, and livability — all in one place.',
  keywords: 'US cities, city data, demographics, housing, cost of living, city comparison, livability',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <div className="page-wrapper">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
