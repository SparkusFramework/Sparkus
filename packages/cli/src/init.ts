import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { CliError } from "./app-loader.js";
import { projectFiles } from "./templates.js";

/** npm package name from a folder name: lowercase, letters, digits, "-", "." and "_". */
export function packageName(folder: string): string {
    const name = folder
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[._-]+|[-]+$/g, "");
    return name.length > 0 ? name : "sparkus-app";
}

/** Writes a new project. Refuses a folder that already has files (besides .git). */
export function initProject(dir: string, cwd: string): { root: string; name: string; files: string[] } {
    const root = resolve(cwd, dir);
    if (existsSync(root) && readdirSync(root).some((entry) => entry !== ".git")) {
        throw new CliError(`${dir} is not empty. Pick a new folder: sparkus init my-api`);
    }
    const name = packageName(basename(root));
    const files = projectFiles(name);
    for (const [path, content] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
    }
    return { root, name, files: Object.keys(files) };
}
