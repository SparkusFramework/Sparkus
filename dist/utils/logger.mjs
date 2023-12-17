export var SparkusLoggerLevel;
(function (SparkusLoggerLevel) {
    SparkusLoggerLevel[SparkusLoggerLevel["DEBUG"] = 0] = "DEBUG";
    SparkusLoggerLevel[SparkusLoggerLevel["INFO"] = 1] = "INFO";
    SparkusLoggerLevel[SparkusLoggerLevel["WARN"] = 2] = "WARN";
    SparkusLoggerLevel[SparkusLoggerLevel["ERROR"] = 3] = "ERROR";
})(SparkusLoggerLevel || (SparkusLoggerLevel = {}));
var Color;
(function (Color) {
    Color["BLUE"] = "\u001B[36m";
    Color["RED"] = "\u001B[31m";
    Color["GRAY"] = "\u001B[90m";
    Color["YELLOW"] = "\u001B[33m";
    Color["RESET"] = "\u001B[0m";
})(Color || (Color = {}));
function color(message, color) {
    return `${color}${message}${Color.RESET}`;
}
export class Logger {
    static level = SparkusLoggerLevel.DEBUG;
    name;
    constructor(config = {}) {
        this.name = config.name;
    }
    debug(message) {
        if (Logger.level <= SparkusLoggerLevel.DEBUG) {
            console.log(color(`[DEBUG] [${this.name}] `, Color.GRAY) + message);
        }
    }
    info(message) {
        if (Logger.level <= SparkusLoggerLevel.INFO) {
            console.log(color(`[INFO] [${this.name}] `, Color.BLUE) + message);
        }
    }
    warn(message) {
        if (Logger.level <= SparkusLoggerLevel.WARN) {
            console.log(color(`[WARN] [${this.name}] `, Color.YELLOW) + message);
        }
    }
    error(message, error) {
        if (Logger.level <= SparkusLoggerLevel.ERROR) {
            console.log(color(`[ERROR] [${this.name}] ${message}`, Color.RED));
            if (error) {
                console.error(error);
            }
        }
    }
}
