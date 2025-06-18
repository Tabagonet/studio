import { AppLayout } from "@/components/core/app-layout";

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout defaultOpen={true}>{children}</AppLayout>;
}
