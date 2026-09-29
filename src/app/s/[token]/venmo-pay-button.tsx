"use client";

import { Button } from "@/components/ui/button";
import { openVenmoPay } from "@/lib/venmo";

export function VenmoPayButton({
  appUrl,
  webUrl,
  label,
}: {
  appUrl: string;
  webUrl: string;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      className="bg-[#008CFF] text-white shadow-[#008CFF]/20 hover:bg-[#0074FF] hover:text-white active:bg-[#0074FF]"
      onClick={() => openVenmoPay(appUrl, webUrl)}
    >
      {label}
    </Button>
  );
}
