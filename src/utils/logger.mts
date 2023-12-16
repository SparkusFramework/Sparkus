export enum SparkusLoggerLevel {
    DEBUG = 0, INFO = 1, WARN = 2, ERROR = 3
}

export interface SparkusLoggerConfig {
    name?: string
}

enum Color {
    BLUE = '\x1b[36m',
    RED = '\x1b[31m',
    GRAY = '\x1b[90m',
    YELLOW = '\x1b[33m',
    RESET = '\x1b[0m',
}

function color(message: string, color: Color): string {
    return `${color}${message}${Color.RESET}`
}

export class SparkusLogger {

    public static level: SparkusLoggerLevel = SparkusLoggerLevel.DEBUG;
    private readonly name?: string;

    constructor(config: SparkusLoggerConfig = {}) {
        this.name = config.name;
    }

    debug(message: string): void {
        if (SparkusLogger.level <= SparkusLoggerLevel.DEBUG) {
            console.log(color(`[DEBUG] [${this.name}] `, Color.GRAY) + message)
        }
    }

    info(message: string): void {
        if (SparkusLogger.level <= SparkusLoggerLevel.INFO) {
            console.log(color(`[INFO] [${this.name}] `, Color.BLUE) + message);
        }
    }

    warn(message: string): void {
        if (SparkusLogger.level <= SparkusLoggerLevel.WARN) {
            console.log(color(`[WARN] [${this.name}] `, Color.YELLOW) + message);
        }
    }

    error(message: string, error?: any): void {
        if (SparkusLogger.level <= SparkusLoggerLevel.ERROR) {
            console.log(color(`[ERROR] [${this.name}] ${message}`, Color.RED));

            if (error) {
                console.error(error);
            }
        }
    }

}