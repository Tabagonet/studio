import { redirect } from 'next/navigation';

// This page is part of the (app) group which implies authentication.
// The root page.tsx redirects to /dashboard.
// This specific file might be redundant if /dashboard is the primary landing page after login.
// However, Next.js expects a page.tsx or route.ts in route segments.
// We will redirect to /dashboard to maintain consistency with the main dashboard page.
export default function AuthenticatedRootPage() {
  redirect('/dashboard');
}
