/**
 * E2B sandbox configuration constants.
 */

/** E2B template ID for Svelte/Vite sandbox */
export const TEMPLATE_ID = 'svelte-vite-sandbox';

/** Maximum sandbox lifetime (10 minutes) */
export const SANDBOX_TIMEOUT_MS = 600_000;

/** Time before sandbox is considered stale (15 minutes) */
export const STALE_TIMEOUT_MS = 15 * 60 * 1000;

/** Cleanup check interval (1 minute) */
export const CLEANUP_INTERVAL_MS = 60_000;

/** Delay for HMR to update before scoring (ms) */
export const HMR_DELAY_MS = 500;

/** Maximum time to wait for Vite server to start (iterations × 300ms) */
export const SERVER_STARTUP_MAX_POLLS = 60;

/** Polling interval when waiting for server (ms) */
export const SERVER_POLL_INTERVAL_MS = 300;

/** Command timeout for server check (ms) */
export const SERVER_CHECK_TIMEOUT_MS = 3000;

/** File write timeout (ms) */
export const FILE_WRITE_TIMEOUT_MS = 10_000;

/** Solutions directory in sandbox */
export const SOLUTIONS_DIR = '/home/user/app/src/solutions';

/** App directory in sandbox */
export const APP_DIR = '/home/user/app';
