// The stored entity. Responses go through `response` schemas, so passwordHash and salt never leave the server.
export interface User {
    id: number;
    email: string;
    username: string;
    bio: string | null;
    image: string | null;
    passwordHash: string;
    salt: string;
}
