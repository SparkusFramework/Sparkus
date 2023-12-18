export var SparkusLoggerLevel;
(function (SparkusLoggerLevel) {
    SparkusLoggerLevel[SparkusLoggerLevel["DEBUG"] = 0] = "DEBUG";
    SparkusLoggerLevel[SparkusLoggerLevel["INFO"] = 1] = "INFO";
    SparkusLoggerLevel[SparkusLoggerLevel["WARN"] = 2] = "WARN";
    SparkusLoggerLevel[SparkusLoggerLevel["ERROR"] = 3] = "ERROR";
})(SparkusLoggerLevel || (SparkusLoggerLevel = {}));
var Color;
(function (Color) {
    // Foregrounds
    Color["WHITE"] = "\u001B[38;5;231m";
    Color["BLACK"] = "\u001B[38;5;232m";
    Color["BLUE"] = "\u001B[38;5;33m";
    Color["PURPLE"] = "\u001B[38;5;99m";
    Color["ORANGE"] = "\u001B[38;5;208m";
    Color["GREEN"] = "\u001B[38;5;41m";
    Color["RED"] = "\u001B[38;5;204m";
    Color["GRAY"] = "\u001B[38;5;243m";
    // Backgrounds
    Color["BG_WHITE"] = "\u001B[48;5;231m";
    Color["BG_BLUE"] = "\u001B[48;5;33m";
    Color["BG_PURPLE"] = "\u001B[48;5;99m";
    Color["BG_ORANGE"] = "\u001B[48;5;208m";
    Color["BG_RED"] = "\u001B[48;5;204m";
    Color["BG_GREEN"] = "\u001B[48;5;41m";
    Color["BG_GRAY"] = "\u001B[48;5;243m";
    // Specials
    Color["BOLD"] = "\u001B[1m";
    Color["RESET"] = "\u001B[0m";
})(Color || (Color = {}));
function color(message, ...color) {
    const colorsString = color.reduce((previous, current) => `${previous}${current}`, "");
    return `${colorsString}${message}${Color.RESET}`;
}
function time() {
    const now = new Date();
    return color(`${now.toISOString()}`, Color.BOLD);
}
export class Logger {
    static level = SparkusLoggerLevel.DEBUG;
    name;
    constructor(config = {}) {
        this.name = config.name;
    }
    debug(message) {
        if (Logger.level <= SparkusLoggerLevel.DEBUG) {
            console.log(time() + " :: " +
                color(`DEBUG`, Color.BOLD) + " " +
                color(`${this.name}`, Color.GRAY, Color.BOLD) + " :: " +
                color(message, Color.GRAY));
        }
    }
    info(message) {
        if (Logger.level <= SparkusLoggerLevel.INFO) {
            console.log(time() + " :: " +
                color(` INFO `, Color.BG_PURPLE, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.PURPLE, Color.BOLD) + " :: " +
                message);
        }
    }
    warn(message) {
        if (Logger.level <= SparkusLoggerLevel.WARN) {
            console.log(time() + " :: " +
                color(` WARN `, Color.BG_ORANGE, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.BOLD, Color.ORANGE) + " :: " +
                color(message, Color.ORANGE));
        }
    }
    error(message, error) {
        if (Logger.level <= SparkusLoggerLevel.ERROR) {
            console.log(time() + " :: " +
                color(` ERROR `, Color.BG_RED, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.BOLD, Color.RED) + " :: " +
                color(message, Color.RED));
            if (error) {
                console.error(error);
            }
        }
    }
}
