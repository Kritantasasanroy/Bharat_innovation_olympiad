import { redirect } from 'next/navigation';

/**
 * Partner review merged into the shared Access Requests queue, which now covers
 * schools too. Kept as a redirect so bookmarks and the old nav link still land
 * somewhere useful.
 */
export default function PartnersPage() {
    redirect('/access');
}
