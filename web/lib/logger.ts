/**
 * Minimal structured logger. Emits one JSON line per event so logs are
 * grep-/ingestion-friendly in production while staying readable in dev.
 * Use instead of bare console.* in services and routes.
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function emit(level: LogLevel, event: string, fields?: Record<string, unknown>) {
    const line: Record<string, unknown> = { level, event, ...fields };
    if (fields?.err instanceof Error) {
        line.err = { name: fields.err.name, message: fields.err.message, stack: fields.err.stack };
    }
    const out = level === 'error' || level === 'warn' ? console.error : console.log;
    try {
        out(JSON.stringify(line));
    } catch {
        out(`[${level}] ${event}`);
    }
}

export const logger = {
    debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
    info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
    error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
