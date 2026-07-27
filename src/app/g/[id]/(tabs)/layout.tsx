import { GroupBottomNav } from "@/components/group-bottom-nav";

export default async function GroupTabsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      {children}
      <GroupBottomNav groupId={id} />
    </>
  );
}
