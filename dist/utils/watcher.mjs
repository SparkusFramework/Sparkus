var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { InjectLogger } from "../decorators/index.mjs";
import * as url from "url";
import * as fs from "fs";
import path from "node:path";
import chokidar from "chokidar";
const TMP = new URL(".sparkus_tmp/", url.pathToFileURL(process.cwd() + "/"));
let Watcher = class Watcher {
    paths;
    cwd;
    watcher;
    logger;
    cwdURL;
    constructor(paths, cwd) {
        this.paths = paths;
        this.cwd = cwd;
        this.cwdURL = cwd
            ? url.pathToFileURL(cwd + "/")
            : url.pathToFileURL(process.cwd() + "/");
    }
    init(app) {
        this.watcher = chokidar.watch(this.paths, {
            cwd: this.cwd,
            persistent: true,
            depth: 20,
        });
        this.watcher.on("ready", () => {
            this.logger.warn("Watcher enabled, please do not use in production.");
        });
        this.watcher.on("change", async (path) => {
            const url = new URL(path, this.cwdURL);
            this.logger.debug(`File changed: ${url}`);
            const isUnloaded = await app.unloadFile(url);
            if (isUnloaded) {
                this.logger.debug(`File "${url}" unloaded.`);
                const isLoaded = await app.loadFile(url);
                if (!isLoaded) {
                    this.logger.warn(`Can't load the file "${url}".`);
                }
            }
            else {
                this.logger.warn(`Can't unload the file "${url}".`);
            }
        });
    }
    async dynamicImport(url) {
        if (!fs.existsSync(TMP))
            fs.mkdirSync(TMP);
        const fileExtension = path.extname(url.pathname);
        const randomised = new URL(Date.now() + fileExtension, TMP);
        fs.copyFileSync(url, randomised);
        const imported = await import(randomised.toString());
        fs.rmSync(TMP, { recursive: true, force: true });
        return imported;
    }
};
Watcher = __decorate([
    InjectLogger,
    __metadata("design:paramtypes", [Array, String])
], Watcher);
export { Watcher };
