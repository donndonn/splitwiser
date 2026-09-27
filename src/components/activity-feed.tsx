import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  MessageCircle,
  PenLine,
  Pencil,
  Receipt,
  Trash2,
  UserMinus,
  UserPlus,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { restoreExpenseAction } from "@/app/g/[id]/expenses/actions";
import { ActivityTime } from "@/components/activity-time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActivityKind } from "@/lib/activity";
import type { ActivityFeedItem } from "@/lib/activity-feed";
import { cn, groupedListClass } from "@/lib/utils";

const kindStyle: Record<ActivityKind, { icon: LucideIcon; tile: string }> = {
  expense_created: { icon: Receipt, tile: "bg-primary/15 text-primary" },
  expense_updated: { icon: Pencil, tile: "bg-muted text-muted-foreground" },
  expense_deleted: { icon: Trash2, tile: "bg-destructive/10 text-destructive" },
  expense_restored: { icon: Undo2, tile: "bg-primary/15 text-primary" },
  comment_added: {
    icon: MessageCircle,
    tile: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  settlement_recorded: {
    icon: Banknote,
    tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  settlement_deleted: { icon: Undo2, tile: "bg-muted text-muted-foreground" },
  group_renamed: { icon: PenLine, tile: "bg-muted text-muted-foreground" },
  member_joined: {
    icon: UserPlus,
    tile: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  member_left: { icon: UserMinus, tile: "bg-muted text-muted-foreground" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function ActivityRow({ item }: { item: ActivityFeedItem }) {
  const style = kindStyle[item.kind] ?? {
    icon: ArrowLeftRight,
    tile: "bg-muted text-muted-foreground",
  };
  const Icon = style.icon;

  const content = (
    <div className="flex gap-3">
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-xl",
            style.tile,
          )}
        >
          <Icon className="size-5" />
        </div>
        {item.actorImage ? (
          <Avatar
            size="sm"
            className="absolute -right-1.5 -bottom-1.5 ring-2 ring-card"
          >
            <AvatarImage src={item.actorImage} alt="" />
            <AvatarFallback className="text-[9px]">
              {initials(item.actorName)}
            </AvatarFallback>
          </Avatar>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground/90">
          {item.parts.map((part, i) =>
            part.strong ? (
              <strong key={i} className="font-semibold text-foreground">
                {part.text}
              </strong>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
        {item.quote ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground italic">
            {`“${item.quote}”`}
          </p>
        ) : null}
        {item.impact ? (
          <p
            className={cn(
              "mt-0.5 text-sm font-medium",
              item.impact.tone === "positive"
                ? "text-balance-positive"
                : item.impact.tone === "negative"
                  ? "text-balance-negative"
                  : "text-muted-foreground",
            )}
          >
            {item.impact.text}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          <ActivityTime at={item.createdAt.toISOString()} />
        </p>
      </div>
    </div>
  );

  const restore = item.restoreExpenseId ? (
    <form
      action={restoreExpenseAction.bind(
        null,
        item.groupId,
        item.restoreExpenseId,
      )}
      className="mt-2 pl-14"
    >
      <Button type="submit" size="sm" variant="outline">
        Restore
      </Button>
    </form>
  ) : null;

  const rowHref = item.restoreExpenseId ? null : item.href;

  return (
    <li>
      {rowHref ? (
        <Link
          href={rowHref}
          className="block px-4 py-3 transition-colors hover:bg-muted/50"
        >
          {content}
        </Link>
      ) : (
        <div className="px-4 py-3">
          {content}
          {restore}
        </div>
      )}
    </li>
  );
}

export function ActivityFeed({
  items,
  emptyDescription,
}: {
  items: ActivityFeedItem[];
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No activity yet</CardTitle>
          <CardDescription>{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={groupedListClass}>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}
