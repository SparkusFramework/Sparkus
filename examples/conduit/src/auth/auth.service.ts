import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, inject } from "sparkus";
import { AppConfig } from "../config.ts";
import type { User } from "../users/user.ts";
import { UserService } from "../users/users.service.ts";

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const TTL_SECONDS = 60 * 60 * 24 * 30;

// HS256 JWTs whose `sub` is the user id, so a username or email change keeps tokens valid.
export class AuthService {
    private readonly secret = inject(AppConfig).JWT_SECRET;
    private readonly users = inject(UserService);

    sign(user: User): string {
        const now = Math.floor(Date.now() / 1000);
        const payload = Buffer.from(JSON.stringify({ sub: user.id, iat: now, exp: now + TTL_SECONDS })).toString("base64url");
        return `${HEADER}.${payload}.${this.signature(`${HEADER}.${payload}`)}`;
    }

    // undefined: no Authorization header. Throws 401 for a header that is present but wrong.
    authenticate(header: string | undefined): User | undefined {
        if (header === undefined) return undefined;
        const space = header.indexOf(" ");
        const scheme = header.slice(0, space);
        if (space < 0 || (scheme !== "Token" && scheme !== "Bearer")) {
            throw HttpError.unauthorized("Authorization header must be \"Token <jwt>\".", { code: "AUTH_MALFORMED" });
        }
        const user = this.verify(header.slice(space + 1));
        if (user === undefined) throw HttpError.unauthorized("Invalid or expired token.", { code: "AUTH_INVALID" });
        return user;
    }

    private verify(jwt: string): User | undefined {
        const parts = jwt.split(".");
        if (parts.length !== 3 || parts[0] !== HEADER) return undefined;
        const [, payload = "", signature = ""] = parts;
        const expected = Buffer.from(this.signature(`${HEADER}.${payload}`));
        const actual = Buffer.from(signature);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
        let claims: { sub?: unknown; exp?: unknown };
        try {
            claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        } catch {
            return undefined;
        }
        if (typeof claims.sub !== "number" || typeof claims.exp !== "number") return undefined;
        if (claims.exp * 1000 < Date.now()) return undefined;
        return this.users.byId(claims.sub);
    }

    private signature(data: string): string {
        return createHmac("sha256", this.secret).update(data).digest("base64url");
    }
}
