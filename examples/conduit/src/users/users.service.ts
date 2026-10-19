import { HttpError } from "sparkus";
import { hashPassword, verifyPassword, type PasswordHash } from "../auth/password.ts";
import { invalidField } from "../shared/errors.ts";
import type { User } from "./user.ts";
import type { UserChanges } from "./users.schemas.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_-]+$/;

export class UserService {
    private readonly byIdMap = new Map<number, User>();
    private readonly byEmail = new Map<string, User>();
    private readonly byName = new Map<string, User>();
    private nextId = 1;

    byId(id: number): User | undefined {
        return this.byIdMap.get(id);
    }

    byUsername(username: string): User | undefined {
        return this.byName.get(username);
    }

    register(username: string, email: string, password: string): User {
        return this.insert(username, email, hashPassword(password));
    }

    // Seeding reuses one hash for every user: scrypt is deliberately slow.
    insert(username: string, email: string, hash: PasswordHash): User {
        this.checkUsername(username, undefined);
        const normalized = this.checkEmail(email, undefined);
        const user: User = { id: this.nextId++, email: normalized, username, bio: null, image: null, ...hash };
        this.byIdMap.set(user.id, user);
        this.byEmail.set(user.email, user);
        this.byName.set(user.username, user);
        return user;
    }

    login(email: string, password: string): User {
        const user = this.byEmail.get(email.toLowerCase());
        if (user === undefined || !verifyPassword(password, user)) {
            throw HttpError.unauthorized("Email or password is invalid.", {
                code: "INVALID_CREDENTIALS",
                extensions: { errors: { "email or password": ["is invalid"] } },
            });
        }
        return user;
    }

    update(user: User, changes: UserChanges): User {
        if (changes.username !== undefined && changes.username !== user.username) {
            this.checkUsername(changes.username, user);
            this.byName.delete(user.username);
            user.username = changes.username;
            this.byName.set(user.username, user);
        }
        if (changes.email !== undefined) {
            const email = this.checkEmail(changes.email, user);
            this.byEmail.delete(user.email);
            user.email = email;
            this.byEmail.set(email, user);
        }
        if (changes.password !== undefined) Object.assign(user, hashPassword(changes.password));
        if (changes.bio !== undefined) user.bio = changes.bio;
        if (changes.image !== undefined) user.image = changes.image;
        return user;
    }

    private checkUsername(username: string, self: User | undefined): void {
        if (!USERNAME.test(username)) throw invalidField("username", "may only contain letters, digits, - and _", "USERNAME_INVALID");
        const owner = this.byName.get(username);
        if (owner !== undefined && owner !== self) throw invalidField("username", "has already been taken", "USERNAME_TAKEN");
    }

    private checkEmail(email: string, self: User | undefined): string {
        if (!EMAIL.test(email)) throw invalidField("email", "is invalid", "EMAIL_INVALID");
        const normalized = email.toLowerCase();
        const owner = this.byEmail.get(normalized);
        if (owner !== undefined && owner !== self) throw invalidField("email", "has already been taken", "EMAIL_TAKEN");
        return normalized;
    }
}
