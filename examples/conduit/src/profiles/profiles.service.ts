import { HttpError, inject } from "sparkus";
import type { User } from "../users/user.ts";
import { UserService } from "../users/users.service.ts";
import type { Profile } from "./profiles.schemas.ts";

const NONE: ReadonlySet<number> = new Set();

export class ProfileService {
    private readonly users = inject(UserService);
    // follower id -> ids of the users they follow
    private readonly follows = new Map<number, Set<number>>();

    get(username: string): User {
        const user = this.users.byUsername(username);
        if (user === undefined) throw HttpError.notFound(`Profile "${username}" not found.`, { code: "PROFILE_NOT_FOUND" });
        return user;
    }

    following(followerId: number | undefined): ReadonlySet<number> {
        return followerId === undefined ? NONE : (this.follows.get(followerId) ?? NONE);
    }

    follow(follower: User, followee: User): void {
        let set = this.follows.get(follower.id);
        if (set === undefined) this.follows.set(follower.id, (set = new Set()));
        set.add(followee.id);
    }

    unfollow(follower: User, followee: User): void {
        this.follows.get(follower.id)?.delete(followee.id);
    }

    view(user: User, viewer: User | undefined): Profile {
        const following = viewer !== undefined && this.following(viewer.id).has(user.id);
        return { username: user.username, bio: user.bio, image: user.image, following };
    }
}
