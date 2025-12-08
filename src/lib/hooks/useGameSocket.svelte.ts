/**
 * WebSocket connection hook for game events.
 * Handles connection, automatic reconnection with exponential backoff,
 * and message routing to event handlers.
 *
 * @example
 * ```ts
 * const handlers: GameEventHandlers = {
 *   challenge_started: (data) => handleChallengeStarted(data),
 *   player_submitted: (data) => handlePlayerSubmitted(data),
 *   // ... other handlers
 * };
 *
 * const socket = useGameSocket('wss://worker.example.com/room/ABC123', handlers);
 * socket.start(); // Connect to WebSocket
 * // socket.connected reflects connection state
 * socket.stop(); // Disconnect and cleanup
 * ```
 */

/** All possible game event types received via WebSocket */
export type GameEventType =
	| 'connected'
	| 'challenge_started'
	| 'player_submitted'
	| 'player_ready'
	| 'round_ended'
	| 'game_ended'
	| 'player_joined'
	| 'player_left'
	| 'room_sandbox_ready'
	| 'sandbox_ready'
	| 'sandbox_log'
	| 'waiting_for_judging'
	| 'judging_started'
	| 'judging_finished'
	| 'player_score_updated'
	| 'judging_complete';

/**
 * Map of event types to their handler functions.
 * All handlers are optional - only handle events you care about.
 */
export type GameEventHandlers = Partial<Record<GameEventType, (data: unknown) => void>>;

/** Maximum delay between reconnection attempts (30 seconds) */
const MAX_RECONNECT_DELAY = 30000;

/**
 * Creates a WebSocket connection with automatic reconnection.
 *
 * @param wsUrl - WebSocket URL to connect to
 * @param handlers - Map of event types to handler functions
 * @returns Socket state and controls
 */
export function useGameSocket(wsUrl: string, handlers: GameEventHandlers) {
	/** Active WebSocket connection */
	let ws: WebSocket | null = null;
	/** Timeout for scheduled reconnection */
	let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
	/** Number of consecutive reconnection attempts */
	let reconnectAttempts = 0;
	/** Current connection state */
	let connected = $state(false);

	/**
	 * Establish WebSocket connection.
	 * Sets up event handlers for open, message, close, and error.
	 */
	function connect() {
		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			reconnectAttempts = 0;
		};

		ws.onmessage = (event) => {
			try {
				const { type, data } = JSON.parse(event.data) as { type: GameEventType; data: unknown };
				handlers[type]?.(data);
			} catch (e) {
				console.error('[WS] Parse error:', e);
			}
		};

		ws.onclose = () => {
			console.warn('[WS] Disconnected, reconnecting...');
			connected = false;
			scheduleReconnect();
		};

		ws.onerror = () => {
			// Error will trigger onclose
		};
	}

	/**
	 * Schedule a reconnection attempt with exponential backoff.
	 * Delay doubles with each attempt, up to MAX_RECONNECT_DELAY.
	 */
	function scheduleReconnect() {
		if (reconnectTimeout) return;
		const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
		reconnectAttempts++;
		reconnectTimeout = setTimeout(() => {
			reconnectTimeout = null;
			connect();
		}, delay);
	}

	/**
	 * Start the WebSocket connection.
	 */
	function start() {
		connect();
	}

	/**
	 * Stop the WebSocket connection and cleanup.
	 * Cancels any pending reconnection attempts.
	 */
	function stop() {
		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}
		ws?.close();
		ws = null;
		connected = false;
	}

	return {
		/** Whether currently connected to WebSocket */
		get connected() {
			return connected;
		},
		start,
		stop
	};
}
