import {Logger} from "../decorators/index.mjs";
import {SparkusLogger} from "../utils/index.mjs";
import {SparkusRouter} from "./router.mjs";
import * as http from "http";

@Logger
export class SparkusServer {

    private logger: SparkusLogger;

    constructor(public port: number, private router: SparkusRouter) {
    }

    public listen() {
        const server = this.createBasicServer()

        server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
            const before = Date.now();
            const response = this.router.execute(req, false);

            res.statusCode = response.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(response.message);

            this.logger.debug(`Request "${req.url}" processed in ${Date.now() - before}ms`)
        })

        server.on('error', err => {
            this.logger.error(`Server error: ${err}`);
        })

        server.listen(this.port, () => {
            this.logger.info(`Server is running on port ${this.port}`);
        });
    }

    // TODO
    public createSecuredServer(): http.Server {
        return null;
    }

    public createBasicServer(): http.Server {
        return http.createServer();
    }
}