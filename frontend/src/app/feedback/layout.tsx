import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';

/** Auth-gated route — nothing here is useful in a search result. */
export const metadata: Metadata = { ...NOINDEX };

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
    return children;
}
