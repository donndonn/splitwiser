"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_COMMENT_LENGTH } from "@/lib/expense-comments";
import type { CommentFormState } from "@/app/g/[id]/expenses/comment-actions";

export function ExpenseCommentComposer({
  action,
}: {
  action: (
    state: CommentFormState,
    formData: FormData,
  ) => Promise<CommentFormState>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(action, { error: null });

  useEffect(() => {
    if (state.postedAt) formRef.current?.reset();
  }, [state.postedAt]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Textarea
        name="body"
        aria-label="Add a comment"
        placeholder="Add a comment"
        maxLength={MAX_COMMENT_LENGTH}
        required
        className="min-h-16"
        aria-invalid={state.error ? true : undefined}
      />
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
