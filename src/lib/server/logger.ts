/**
 * Centralized logging utility.
 * Uses Pino for structured logging with colored output in dev, JSON in prod.
 */
import pino from 'pino';
import { dev } from '$app/environment';

const transport = dev
	? {
			target: 'pino-pretty',
			options: {
				colorize: true,
				translateTime: 'HH:MM:ss',
				ignore: 'pid,hostname'
			}
		}
	: undefined;

const baseLogger = pino({
	level: dev ? 'debug' : 'info',
	transport
});

/**
 * Create a child logger with a specific context name.
 * Usage: const log = createLogger('MyModule');
 */
export function createLogger(name: string) {
	const child = baseLogger.child({ name });

	return {
		debug: (msg: string, data?: Record<string, unknown>) => child.debug(data, msg),
		info: (msg: string, data?: Record<string, unknown>) => child.info(data, msg),
		warn: (msg: string, data?: Record<string, unknown>) => child.warn(data, msg),
		error: (msg: string, data?: Record<string, unknown>) => child.error(data, msg)
	};
}

/**
 * Default logger instance for quick use.
 */
export const logger = createLogger('App');
