import { App } from "../core/index.mjs";
export declare class Watcher {
    private readonly paths;
    private readonly cwd;
    private watcher;
    private logger;
    private readonly cwdURL;
    constructor(paths: string[], cwd: string);
    init(app: App): void;
    dynamicImport(url: URL): Promise<any>;
}
