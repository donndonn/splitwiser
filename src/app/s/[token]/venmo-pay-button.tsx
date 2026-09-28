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
      onClick={() => openVenmoPay(appUrl, webUrl)}
    >
      {label}
    </Button>
  );
}
