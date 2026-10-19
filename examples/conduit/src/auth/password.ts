import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export interface PasswordHash {
    passwordHash: string;
    salt: string;
}

export function hashPassword(password: string): PasswordHash {
    const salt = randomBytes(16).toString("base64url");
    return { passwordHash: scryptSync(password, salt, KEY_LENGTH).toString("base64url"), salt };
}

export function verifyPassword(password: string, stored: PasswordHash): boolean {
    const expected = Buffer.from(stored.passwordHash, "base64url");
    const actual = scryptSync(password, stored.salt, KEY_LENGTH);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
