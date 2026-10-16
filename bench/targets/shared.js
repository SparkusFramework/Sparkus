// Domain logic shared by every target, so only the framework differs.

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = "127.0.0.1";

export function findUser(id) {
    return { id, name: "User " + id };
}

/** Hand-written validation for the "raw" targets (same rules as the schemas). */
export function isValidUser(body) {
    return (
        typeof body === "object" &&
        body !== null &&
        typeof body.name === "string" &&
        body.name.length >= 1 &&
        body.name.length <= 100 &&
        Number.isInteger(body.age) &&
        body.age >= 0 &&
        body.age <= 150
    );
}
