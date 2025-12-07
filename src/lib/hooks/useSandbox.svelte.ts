/**
 * Sandbox state hook.
 * Manages E2B sandbox logs, preview URL, and ready state.
 *
 * @example
 * ```ts
 * const sandbox = useSandbox();
 * sandbox.addLog('Building...');
 * sandbox.setUrl('https://sandbox-123.e2b.dev');
 * sandbox.setReady(true);
 * // Access: sandbox.logs, sandbox.url, sandbox.ready
 * sandbox.reset(); // Clear all state
 * ```
 */

/**
 * Creates sandbox state management for E2B preview environments.
 *
 * @param initialUrl - Optional initial sandbox URL
 * @param initialReady - Optional initial ready state
 * @returns Sandbox state and controls
 */
export function useSandbox(initialUrl?: string | null, initialReady?: boolean) {
	/** Log messages from the sandbox build/execution */
	let logs: string[] = $state([]);
	/** URL to the sandbox preview (null if not yet available) */
	let url: string | null = $state(initialUrl || null);
	/** Whether the sandbox is ready for preview */
	let ready = $state(initialReady || false);

	/**
	 * Add a log message to the sandbox output.
	 * @param message - Log message to append
	 */
	function addLog(message: string) {
		logs = [...logs, message];
	}

	/**
	 * Set the sandbox preview URL.
	 * @param newUrl - URL to the sandbox preview
	 */
	function setUrl(newUrl: string) {
		url = newUrl;
	}

	/**
	 * Set the sandbox ready state.
	 * @param isReady - Whether the sandbox is ready
	 */
	function setReady(isReady: boolean) {
		ready = isReady;
	}

	/**
	 * Reset all sandbox state to initial values.
	 */
	function reset() {
		logs = [];
		url = null;
		ready = false;
	}

	return {
		/** Array of log messages from sandbox */
		get logs() {
			return logs;
		},
		/** Sandbox preview URL or null */
		get url() {
			return url;
		},
		/** Whether sandbox is ready for preview */
		get ready() {
			return ready;
		},
		addLog,
		setUrl,
		setReady,
		reset
	};
}
