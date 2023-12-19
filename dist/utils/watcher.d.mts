import { App } from "../core/index.mjs";
export declare class Watcher {
    private readonly paths;
    private readonly cwd;
    private readonly cwdURL;
    private logger;
    private watcher;
    constructor(paths: string[], cwd: string | undefined);
    init(app: App): void;
    private createTemporaryFiles;
    private deleteTemporaryFiles;
    dynamicImport(url: URL): Promise<any>;
}
