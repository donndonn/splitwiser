import { GroupTabsShell } from "@/components/group-tabs-shell";

export default async function GroupTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <GroupTabsShell groupId={id}>{children}</GroupTabsShell>;
}
