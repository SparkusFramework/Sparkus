import { t, type Infer } from "sparkus";

export const UserResponse = t.object({
    user: t.object({
        email: t.string(),
        token: t.string(),
        username: t.string(),
        bio: t.nullable(t.string()),
        image: t.nullable(t.string()),
    }),
});

export const Credentials = t.object({
    email: t.string({ min: 1, max: 254 }),
    password: t.string({ min: 1, max: 200 }),
});

export const NewUser = t.object({
    username: t.string({ min: 1, max: 50 }),
    email: t.string({ min: 3, max: 254 }),
    password: t.string({ min: 8, max: 200 }),
});

export const UserChanges = t.object({
    email: t.optional(t.string({ min: 3, max: 254 })),
    username: t.optional(t.string({ min: 1, max: 50 })),
    password: t.optional(t.string({ min: 8, max: 200 })),
    bio: t.optional(t.nullable(t.string({ max: 1000 }))),
    image: t.optional(t.nullable(t.string({ max: 2000 }))),
});
export type UserChanges = Infer<typeof UserChanges>;
