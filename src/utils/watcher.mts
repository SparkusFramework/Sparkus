import { InjectLogger } from "../decorators/index.mjs";
import { Logger } from "./logger.mjs";

import * as url from "url";
import * as fs from "fs";
import chokidar, { FSWatcher } from "chokidar";
import { App } from "../core/index.mjs";
import path from "node:path";

const cwd = url.pathToFileURL(process.cwd() + "/");
const watcherBaseURL = new URL(".sparkus/watcher/", cwd);

@InjectLogger
export class Watcher {
    private watcher: FSWatcher;
    private logger: Logger;
    private readonly cwdURL: URL;

    constructor(
        private readonly paths: string[],
        private readonly cwd: string,
    ) {
        this.cwdURL = cwd
            ? url.pathToFileURL(cwd + "/")
            : url.pathToFileURL(process.cwd() + "/");
    }

    public init(app: App): void {
        this.watcher = chokidar.watch(this.paths, {
            cwd: this.cwd,
            persistent: true,
            depth: 20,
        });

        this.watcher.on("ready", () => {
            this.logger.warn(
                "Watcher enabled, please do not use in production.",
            );
        });

        this.watcher.on("change", async (path: string) => {
            const url = new URL(path, this.cwdURL);
            this.logger.debug(`File changed: ${url}`);

            const isUnloaded = await app.unloadFile(url);

            if (isUnloaded) {
                this.logger.debug(`File "${url}" unloaded.`);
                const {isLoaded, controller} = await app.loadFile(url);

                if (isLoaded) {
                    this.logger.info(`Controller "${controller.name}" successfully refreshed.`);
                } else {
                    this.logger.warn(`Can't load the file "${url}".`);
                }
            } else {
                this.logger.warn(`Can't unload the file "${url}".`);
            }
        });
    }

    private createTemporaryFiles(): URL {
        if (!fs.existsSync(watcherBaseURL))
            fs.mkdirSync(watcherBaseURL, { recursive: true });

        const base = new URL(Date.now() + "/", watcherBaseURL);

        this.paths.forEach(currentPath => {
            const folder = new URL(currentPath, cwd);
            const destination = new URL(currentPath, base);

            if (!fs.existsSync(destination))
                fs.mkdirSync(destination, { recursive: true });

            fs.cpSync(folder, destination, { recursive: true })
        })

        return base;
    }

    private deleteTemporaryFiles() {
        fs.rmSync(watcherBaseURL, { recursive: true, force: true });
    }

    public async dynamicImport(url: URL): Promise<any> {

        const temp = this.createTemporaryFiles();

        try {
            const relativePath = path.relative(this.cwdURL.pathname, url.pathname);
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
