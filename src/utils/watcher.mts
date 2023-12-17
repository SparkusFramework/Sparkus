import { InjectLogger } from "../decorators/index.mjs";
import { Logger } from "./logger.mjs";

import * as url from "url";
import * as fs from "fs";
import path from "node:path";
import chokidar, { FSWatcher } from "chokidar";
import { App } from "../core/index.mjs";

const TMP = new URL(".sparkus_tmp/", url.pathToFileURL(process.cwd() + "/"));

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
                const isLoaded = await app.loadFile(url);
                if (!isLoaded) {
                    this.logger.warn(`Can't load the file "${url}".`);
                }
            } else {
                this.logger.warn(`Can't unload the file "${url}".`);
            }
        });
    }

    public async dynamicImport(url: URL): Promise<any> {
        if (!fs.existsSync(TMP)) fs.mkdirSync(TMP);

        const fileExtension = path.extname(url.pathname);

        const randomised = new URL(Date.now() + fileExtension, TMP);
        fs.copyFileSync(url, randomised);

        const imported = await import(randomised.toString());

        fs.rmSync(TMP, { recursive: true, force: true });

        return imported;
    }
}
