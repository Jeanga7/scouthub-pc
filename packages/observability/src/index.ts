export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLog {
  readonly level: LogLevel;
  readonly message: string;
  readonly requestId?: string;
  readonly route?: string;
  readonly outcome?: string;
}

export function createConsoleLogger() {
  return {
    log(entry: StructuredLog): void {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...entry }));
    }
  };
}
