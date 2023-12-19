import { Logger } from "../utils/index.mjs";
import { Router } from "./router.mjs";
import * as http from "http";
import { InitLoggerClass } from "../decorators/logger.decorator.mjs";

@InitLoggerClass()
export class Server {

    private logger: Logger;

    constructor(
        public port: number,
        private router: Router,
    ) {}

    public listen() {
        const server = this.createBasicServer();

        server.on(
            "request",
            (req: http.IncomingMessage, res: http.ServerResponse) => {
                const before = Date.now();
                const response = this.router.execute(req, false);

                res.statusCode = response.status;
                res.setHeader("Content-Type", response.type);
                res.end(response.message);

                this.logger.debug(
                    `Request "${req.url}" processed in ${
                        Date.now() - before
                    }ms`,
                );
            },
        );

        server.on("error", (err) => {
            this.logger.error(`Server error: ${err}`);
        });

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
