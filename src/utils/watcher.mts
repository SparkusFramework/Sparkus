import { Logger } from "./logger.mjs";
import { InitLoggerClass } from "../decorators/index.mjs";
import { App } from "../core/index.mjs";

import * as url from "url";
import * as fs from "fs";
import chokidar, { FSWatcher } from "chokidar";
import path from "node:path";

const cwd = url.pathToFileURL(process.cwd() + "/");
const watcherBaseURL = new URL(".sparkus/watcher/", cwd);

@InitLoggerClass()
export class Watcher {

    private readonly cwdURL: URL;

    private logger: Logger;
    private watcher: FSWatcher;

    constructor(
        private readonly paths: string[],
        private readonly cwd: string | undefined
    ) {
        this.cwdURL = url.pathToFileURL(cwd ?? process.cwd() + "/")
    }

    public init(app: App): void {
        this.watcher = chokidar.watch(this.paths, {
            cwd: this.cwd,
            persistent: true,
            depth: 20
        });

        this.watcher.on("ready", () => {
            this.logger.warn(
                "Watcher enabled, please do not use in production."
            );
        });

        this.watcher.on("change", async (path: string) => {
            const url = new URL(path, this.cwdURL);
            this.logger.debug(`File changed: ${url}`);

            const isUnloaded = await app.unloadFile(url);

            if (isUnloaded) {
                this.logger.debug(`File "${url}" unloaded.`);

                await app.loadFile(url);

                await app.injectableManager.injectAllDependencies();

                this.logger.info(`File "${url}" successfully refreshed.`);
            } else {
                this.logger.warn(`Can't unload the file "${url}".`);
            }
        });
    }

    private createTemporaryFiles(): URL {
        if (!fs.existsSync(watcherBaseURL))
            fs.mkdirSync(watcherBaseURL, { recursive: true });

        const base = new URL(Date.now() + "/", watcherBaseURL);

        this.paths.forEach((currentPath) => {
            const folder = new URL(currentPath, cwd);
            const destination = new URL(currentPath, base);

            if (!fs.existsSync(destination))
                fs.mkdirSync(destination, { recursive: true });

            fs.cpSync(folder, destination, { recursive: true });
        });

        return base;
    }

    private deleteTemporaryFiles() {
        fs.rmSync(watcherBaseURL, { recursive: true, force: true });
    }

    public async dynamicImport(url: URL): Promise<any> {
        const temp = this.createTemporaryFiles();

        try {
            const relativePath = path.relative(
                this.cwdURL.pathname,
                url.pathname
            );
            const randomised = new URL(relativePath, temp);

            return (await import(randomised.toString())).default;
        } catch (e) {
            this.logger.error(`There is an error with "${url}":`, e);
        } finally {
            this.deleteTemporaryFiles();
        }

        return null;
    }
}
