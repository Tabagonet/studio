import { redirect } from 'next/navigation';

export default function RootPage() {
  // The root layout already handles auth logic and redirects to /login if needed.
  // If the user is authenticated, they will be directed to the dashboard.
  redirect('/login');
}
