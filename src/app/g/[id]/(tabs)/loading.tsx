export default function GroupTabsLoading() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-border/60 bg-background/90 px-4 py-2">
        <div className="size-9 animate-pulse rounded-xl bg-muted" />
        <div className="mx-auto h-4 w-28 animate-pulse rounded-md bg-muted" />
        <div className="size-9" />
      </header>
      <main className="flex-1 space-y-4 px-4 py-5 pb-24">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-12 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
          <div className="h-16 animate-pulse rounded-xl bg-muted" />
        </div>
      </main>
    </div>
  );
}
