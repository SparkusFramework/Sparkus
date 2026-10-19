import { t, type Infer } from "sparkus";

export const Profile = t.object({
    username: t.string(),
    bio: t.nullable(t.string()),
    image: t.nullable(t.string()),
    following: t.boolean(),
});
export type Profile = Infer<typeof Profile>;

export const ProfileResponse = t.object({ profile: Profile });
