/** Share-page links keep the viewer's "which one are you" pick. */
function withViewer(path: string, viewerId: string | null) {
  return viewerId ? `${path}?me=${encodeURIComponent(viewerId)}` : path;
}

export function sharedGroupHref(token: string, viewerId: string | null) {
  return withViewer(`/s/${encodeURIComponent(token)}`, viewerId);
}

export function sharedExpenseHref(
  token: string,
  expenseId: string,
  viewerId: string | null,
) {
  return withViewer(
    `/s/${encodeURIComponent(token)}/e/${encodeURIComponent(expenseId)}`,
    viewerId,
  );
}
