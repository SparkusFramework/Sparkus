export enum SparkusLoggerLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export interface SparkusLoggerConfig {
    name?: string;
}

enum Color {
    // Foregrounds
    WHITE = "\x1b[38;5;231m",
    BLACK = "\x1b[38;5;232m",
    BLUE = "\x1b[38;5;33m",
    PURPLE = "\x1b[38;5;99m",
    ORANGE = "\x1b[38;5;208m",
    GREEN = "\x1b[38;5;41m",
    RED = "\x1b[38;5;204m",
    GRAY = "\x1b[38;5;243m",
    // Backgrounds
    BG_WHITE = "\x1b[48;5;231m",
    BG_BLUE = "\x1b[48;5;33m",
    BG_PURPLE = "\x1b[48;5;99m",
    BG_ORANGE = "\x1b[48;5;208m",
    BG_RED = "\x1b[48;5;204m",
    BG_GREEN = "\x1b[48;5;41m",
    BG_GRAY = "\x1b[48;5;243m",
    // Specials
    BOLD = "\x1b[1m",
    RESET = "\x1b[0m",
}

function color(message: string, ...color: Color[]): string {
    const colorsString = color.reduce((previous, current) => `${previous}${current}`, "");
    return `${colorsString}${message}${Color.RESET}`;
}

function time(): string {
    const now = new Date();
    return color(`${now.toISOString()}`, Color.BOLD);
}

export class Logger {
    public static level: SparkusLoggerLevel = SparkusLoggerLevel.DEBUG;
    private readonly name?: string;

    constructor(config: SparkusLoggerConfig = {}) {
        this.name = config.name;
    }

    debug(message: string): void {
        if (Logger.level <= SparkusLoggerLevel.DEBUG) {
            console.log(
                time() + " :: " +
                color(`DEBUG`, Color.BOLD) + " " +
                color(`${this.name}`, Color.GRAY, Color.BOLD) + " :: " +
                color(message, Color.GRAY)
            );
        }
    }

    info(message: string): void {
        if (Logger.level <= SparkusLoggerLevel.INFO) {
            console.log(
                time() + " :: " +
                color(` INFO `, Color.BG_PURPLE, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.PURPLE, Color.BOLD) + " :: " +
                message
            );
        }
    }

    warn(message: string): void {
        if (Logger.level <= SparkusLoggerLevel.WARN) {
            console.log(
                time() + " :: " +
                color(` WARN `, Color.BG_ORANGE, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.BOLD, Color.ORANGE) + " :: " +
                color(message, Color.ORANGE)
            );
        }
    }

    error(message: string, error?: any): void {
        if (Logger.level <= SparkusLoggerLevel.ERROR) {
            console.log(
                time() + " :: " +
                color(` ERROR `, Color.BG_RED, Color.WHITE, Color.BOLD) + " " +
                color(`${this.name}`, Color.BOLD, Color.RED) + " :: " +
                color(message, Color.RED)
            );

            if (error) {
                console.error(error);
            }
        }
    }
}
