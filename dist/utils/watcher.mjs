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
import chokidar from "chokidar";
import path from "node:path";
const cwd = url.pathToFileURL(process.cwd() + "/");
const watcherBaseURL = new URL(".sparkus/watcher/", cwd);
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
                const { isLoaded, controller } = await app.loadFile(url);
                if (isLoaded) {
                    this.logger.info(`Controller "${controller.name}" successfully refreshed.`);
                }
                else {
                    this.logger.warn(`Can't load the file "${url}".`);
                }
            }
            else {
                this.logger.warn(`Can't unload the file "${url}".`);
            }
        });
    }
    createTemporaryFiles() {
        if (!fs.existsSync(watcherBaseURL))
            fs.mkdirSync(watcherBaseURL, { recursive: true });
        const base = new URL(Date.now() + "/", watcherBaseURL);
        this.paths.forEach(currentPath => {
            const folder = new URL(currentPath, cwd);
            const destination = new URL(currentPath, base);
            if (!fs.existsSync(destination))
                fs.mkdirSync(destination, { recursive: true });
            fs.cpSync(folder, destination, { recursive: true });
        });
        return base;
    }
    deleteTemporaryFiles() {
        fs.rmSync(watcherBaseURL, { recursive: true, force: true });
    }
    async dynamicImport(url) {
        const temp = this.createTemporaryFiles();
        try {
            const relativePath = path.relative(this.cwdURL.pathname, url.pathname);
            const randomised = new URL(relativePath, temp);
            return (await import(randomised.toString())).default;
        }
        catch (e) {
            this.logger.error(`There is an error with "${url}":`, e);
        }
        finally {
            this.deleteTemporaryFiles();
        }
        return null;
    }
};
Watcher = __decorate([
    InjectLogger,
    __metadata("design:paramtypes", [Array, String])
], Watcher);
export { Watcher };
