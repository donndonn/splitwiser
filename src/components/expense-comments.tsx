import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExpenseCommentComposer } from "@/components/expense-comment-composer";
import type { CommentFormState } from "@/app/g/[id]/expenses/comment-actions";

export type ExpenseCommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorImage: string | null;
  canDelete: boolean;
};

function initials(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export function ExpenseComments({
  comments,
  addAction,
  deleteAction,
}: {
  comments: ExpenseCommentRow[];
  addAction: (
    state: CommentFormState,
    formData: FormData,
  ) => Promise<CommentFormState>;
  deleteAction: (commentId: string) => Promise<void>;
}) {
  return (
    <section className="mt-6 space-y-3" aria-labelledby="expense-comments">
      <h3 id="expense-comments" className="text-sm font-medium">
        Comments
      </h3>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar size="sm">
                {comment.authorImage ? (
                  <AvatarImage src={comment.authorImage} alt="" />
                ) : null}
                <AvatarFallback>{initials(comment.authorName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span className="text-sm font-medium text-foreground">
                    {comment.authorName}
                  </span>
                  <time dateTime={comment.createdAt.toISOString()}>
                    {formatDistanceToNow(comment.createdAt, {
                      addSuffix: true,
                    })}
                  </time>
                  {comment.canDelete ? (
                    <form
                      action={deleteAction.bind(null, comment.id)}
                      className="ml-auto"
                    >
                      <button
                        type="submit"
                        className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">
                  {comment.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ExpenseCommentComposer action={addAction} />
    </section>
  );
}
