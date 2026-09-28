import type { Metadata } from "next";

// The token is the only secret: keep it out of search results and out of
// the Referer header sent to Venmo or anywhere else.
export const metadata: Metadata = {
  title: "Shared group",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function SharedGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
