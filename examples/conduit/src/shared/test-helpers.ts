import { createTestApp, type TestApp } from "@sparkus/testing";
import { options } from "../app.ts";

export type { TestApp };

export function newApp(): Promise<TestApp> {
    return createTestApp(options);
}

export async function register(app: TestApp, username: string): Promise<string> {
    const res = await app.inject({
        method: "POST",
        url: "/api/users",
        body: { user: { username, email: `${username}@example.com`, password: "password123" } },
    });
    if (res.status !== 201) throw new Error(`register ${username}: ${res.status} ${res.text}`);
    return res.json().user.token;
}

export function auth(token: string): Record<string, string> {
    return { authorization: `Token ${token}` };
}

// Every response body, stringified: no secret may appear anywhere in it.
export function expectNoSecrets(text: string): void {
    for (const field of ["passwordHash", "salt", "favoritedBy", "authorId", "password"]) {
        if (text.includes(`"${field}"`)) throw new Error(`Response leaks "${field}": ${text}`);
    }
}
