import { t, type Infer } from "sparkus";
import { Profile } from "../profiles/profiles.schemas.ts";

export const CommentView = t.object({
    id: t.integer(),
    createdAt: t.string(),
    updatedAt: t.string(),
    body: t.string(),
    author: Profile,
});
export type CommentView = Infer<typeof CommentView>;

export const CommentResponse = t.object({ comment: CommentView });
export const CommentList = t.object({ comments: t.array(CommentView) });
export const NewComment = t.object({ body: t.string({ min: 1, max: 10_000 }) });
