import chalk from "chalk";

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class LogEntry {
  public readonly timestamp: string;
  public readonly level: LogLevel;
  public readonly message: string;
  public readonly data?: any;
  public readonly metadata: {
    category?: string;
    source?: string;
    userId?: string;
    sessionId?: string;
    traceId?: string;
  };

  constructor(
    level: LogLevel,
    message: string,
    data?: any,
    metadata?: {
      category?: string;
      source?: string;
      userId?: string;
      sessionId?: string;
      traceId?: string;
    },
  ) {
    this.timestamp = new Date().toISOString();
    this.level = level;
    this.message = message;
    this.data = data;
    this.metadata = {
      category: "default",
      ...metadata,
    };
  }

  /**
   * Convert log entry to JSON for serialization
   */
  toJSON(): object {
    return {
      timestamp: this.timestamp,
      level: LogLevel[this.level],
      message: this.message,
      data: this.data,
      metadata: this.metadata,
    };
  }

  /**
   * Get formatted log message with context
   */
  getFormattedMessage(): string {
    const context = [
      this.metadata.source ? `[${this.metadata.source}]` : "",
      this.metadata.category ? `<${this.metadata.category}>` : "",
      this.metadata.traceId ? `{${this.metadata.traceId}}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return `${context ? context + " " : ""}${this.message}`;
  }

  /**
   * Check if this log entry matches specified criteria
   */
  matches(level?: LogLevel, category?: string): boolean {
    return (
      (level === undefined || this.level === level) &&
      (category === undefined || this.metadata.category === category)
    );
  }

  /**
   * Create a new log entry with additional metadata
   */
  withMetadata(newMetadata: Partial<LogEntry["metadata"]>): LogEntry {
    return new LogEntry(this.level, this.message, this.data, {
      ...this.metadata,
      ...newMetadata,
    });
  }

  /**
   * Create a new log entry with additional data
   */
  withData(newData: any): LogEntry {
    return new LogEntry(
      this.level,
      this.message,
      { ...this.data, ...newData },
      this.metadata,
    );
  }
}

class Logger {
  private level: LogLevel;
  private logs: LogEntry[] = [];
  private context: {
    category?: string;
    source?: string;
    userId?: string;
    sessionId?: string;
    traceId?: string;
  } = {};

  constructor(level: LogLevel = LogLevel.INFO) {
    if (process.env.LOG_LEVEL !== undefined) {
      const levelName = process.env.LOG_LEVEL.toUpperCase();
      this.level = LogLevel[levelName as keyof typeof LogLevel] || level;
    } else {
      this.level = level;
    }
  }

  /**
   * Set global context for all subsequent log entries
   */
  setContext(context: Partial<typeof Logger.prototype.context>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear global context
   */
  clearContext(): void {
    this.context = {};
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ): LogEntry {
    return new LogEntry(level, message, data, {
      ...this.context,
      ...additionalMetadata,
    });
  }

  private log(
    level: LogLevel,
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ) {
    if (level < this.level) return;

    const logEntry = this.createLogEntry(
      level,
      message,
      data,
      additionalMetadata,
    );
    this.logs.push(logEntry);

    if (process.env.NODE_ENV !== "production") {
      this.printLog(logEntry);
    }
  }

  private printLog(entry: LogEntry): void {
    const timestamp = chalk.gray(entry.timestamp);
    const levelBadge = this.getLevelBadge(entry.level);
    const formattedMessage = entry.getFormattedMessage();
    const dataDisplay = entry.data
      ? chalk.dim(`\n${JSON.stringify(entry.data, null, 2)}`)
      : "";

    console.log(`${timestamp} ${levelBadge} ${formattedMessage}${dataDisplay}`);
  }

  private getLevelBadge(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return chalk.blue("DEBUG");
      case LogLevel.INFO:
        return chalk.green("INFO");
      case LogLevel.WARN:
        return chalk.yellow("WARN");
      case LogLevel.ERROR:
        return chalk.red("ERROR");
      default:
        return chalk.gray("LOG");
    }
  }

  // Logging methods with automatic context
  debug(
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ): void {
    this.log(LogLevel.DEBUG, message, data, additionalMetadata);
  }

  info(
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ): void {
    this.log(LogLevel.INFO, message, data, additionalMetadata);
  }

  warn(
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ): void {
    this.log(LogLevel.WARN, message, data, additionalMetadata);
  }

  error(
    message: string,
    data?: any,
    additionalMetadata?: Record<string, any>,
  ): void {
    this.log(LogLevel.ERROR, message, data, additionalMetadata);
  }

  // Query methods
  getLogs(level?: LogLevel, category?: string): LogEntry[] {
    return this.logs.filter((entry) => entry.matches(level, category));
  }

  getLogsByCategory(category: string): LogEntry[] {
    return this.logs.filter((entry) => entry.metadata.category === category);
  }

  getLogsBySource(source: string): LogEntry[] {
    return this.logs.filter((entry) => entry.metadata.source === source);
  }

  getRecentLogs(count: number = 10): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Utility methods
  clearLogs(): void {
    this.logs = [];
  }

  exportLogs(format: "json" | "csv" = "json"): string {
    if (format === "json") {
      return JSON.stringify(this.logs, null, 2);
    }

    if (format === "csv") {
      const headers = [
        "timestamp",
        "level",
        "message",
        "category",
        "source",
        "traceId",
      ];
      const rows = this.logs.map((entry) => [
        entry.timestamp,
        LogLevel[entry.level],
        entry.message,
        entry.metadata.category,
        entry.metadata.source,
        entry.metadata.traceId,
      ]);

      return [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
    }

    throw new Error(`Unsupported export format: ${format}`);
  }
}
// Create a singleton logger instance
export const logger = new Logger();

// Utility function to create a logger with specific context
export function createLogger(category: string): Logger {
  const loggerInstance = new Logger();
  loggerInstance.setContext({ category });
  return loggerInstance;
}

// Export LogLevel and LogEntry for advanced use cases
export { LogLevel, LogEntry };
