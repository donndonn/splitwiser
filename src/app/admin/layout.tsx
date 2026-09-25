import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Site admin",
  robots: { index: false, follow: false },
};

/** Each page and action checks requireSiteAdmin itself. */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
