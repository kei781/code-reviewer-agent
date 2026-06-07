export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LogOptions {
  readonly level?: LogLevel;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type LogSink = (entry: LogEntry) => void;

let activeSink: LogSink = defaultLogSink;

export function log(message: string, options: LogOptions = {}): void {
  const entry: LogEntry = {
    level: options.level ?? "info",
    message,
    ...(options.metadata === undefined ? {} : { metadata: options.metadata })
  };

  activeSink(entry);
}

export function setLogSink(sink: LogSink): void {
  activeSink = sink;
}

export function resetLogSink(): void {
  activeSink = defaultLogSink;
}

function defaultLogSink(entry: LogEntry): void {
  const metadata = entry.metadata === undefined ? "" : ` ${JSON.stringify(entry.metadata)}`;
  process.stdout.write(`[${entry.level}] ${entry.message}${metadata}\n`);
}
