/**
 * Shared test fixtures for E2E game tests.
 *
 * Provides reusable helpers for:
 * - Creating game contexts (multiple browser contexts/pages)
 * - Room creation and joining
 * - Game state setup (lobby, playing, review, game over)
 * - Sandbox cleanup
 * - Shared sandbox across tests (worker-scoped)
 */

import {
	test as base,
	expect,
	type Page,
	type BrowserContext,
	type Browser
} from '@playwright/test';
import { MODELS, DEFAULT_MODEL } from '../../../src/lib/config/models';

// Get the default model name for assertions
export const DEFAULT_MODEL_NAME = MODELS.find((m) => m.id === DEFAULT_MODEL)!.name;

/** Shared room state for tests within a worker */
interface SharedRoom {
	code: string;
	url: string;
	hostContext: BrowserContext;
	hostPage: Page;
	isGameStarted: boolean;
}

/** Result of creating a game context with multiple players */
export interface GameContext {
	contexts: BrowserContext[];
	pages: Page[];
	cleanup: () => Promise<void>;
}

/** Result of creating a room */
export interface RoomInfo {
	code: string;
	url: string;
}

/**
 * Create a game context with multiple browser contexts and pages.
 * Each context has its own session/cookies (simulates different players).
 */
export async function createGameContext(
	browser: Browser,
	playerCount: number = 2
): Promise<GameContext> {
	const contexts: BrowserContext[] = [];
	const pages: Page[] = [];

	for (let i = 0; i < playerCount; i++) {
		const context = await browser.newContext();
		const page = await context.newPage();
		contexts.push(context);
		pages.push(page);
	}

	return {
		contexts,
		pages,
		cleanup: async () => {
			for (const ctx of contexts) {
				try {
					await ctx.close();
				} catch {
					// Context might already be closed
				}
			}
		}
	};
}

/**
 * Cleanup sandboxes via the test cleanup API.
 * Call this after tests that create rooms to avoid E2B rate limiting.
 */
export async function cleanupSandboxes(): Promise<void> {
	try {
		const response = await fetch('http://localhost:5173/api/test-cleanup', { method: 'POST' });
		if (response.ok) {
			const result = await response.json();
			if (result.sandboxesKilled > 0) {
				console.log(`[Cleanup] Killed ${result.sandboxesKilled} sandbox(es)`);
			}
		}
	} catch {
		// Server might not be running, ignore
	}
}

/**
 * Create a room and return room info.
 * @param page - The page to use for room creation
 * @param playerName - Name for the host player
 * @returns Room code and URL
 */
export async function createRoom(page: Page, playerName: string = 'TestHost'): Promise<RoomInfo> {
	await page.goto('/create');
	await page.fill('input#nameInput', playerName);
	await page.waitForTimeout(100); // Brief wait for form state
	await page.click('button[type="submit"]');
	await page.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

	const url = page.url();
	const code = url.split('/').pop()!;

	// Wait for lobby to be visible
	await expect(page.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

	return { code, url };
}

/**
 * Join an existing room.
 * @param page - The page to use for joining
 * @param roomCode - The room code to join
 * @param playerName - Name for the joining player
 */
export async function joinRoom(
	page: Page,
	roomCode: string,
	playerName: string = 'TestPlayer'
): Promise<void> {
	await page.goto('/join');
	await page.fill('input#code', roomCode);
	await page.fill('input#nameInput', playerName);
	await page.waitForTimeout(100);
	await page.click('button[type="submit"]');
	await page.waitForURL(`/${roomCode}`, { timeout: 30000 });
}

/**
 * Wait for sandbox to be ready (start button enabled).
 * @param page - The host's page
 * @param timeout - Maximum time to wait (default 60s for sandbox init)
 */
export async function waitForSandboxReady(page: Page, timeout: number = 60000): Promise<void> {
	await expect(page.locator('button:has-text("start game")')).toBeEnabled({ timeout });
}

/**
 * Start the game (host only).
 * @param hostPage - The host's page
 */
export async function startGame(hostPage: Page): Promise<void> {
	await hostPage.click('button:has-text("start game")');
	// Wait for game to start - round indicator should appear
	await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });
}

/**
 * Setup a full game with multiple players in the playing phase.
 * @param browser - Playwright browser
 * @param playerCount - Number of players (including host)
 * @param playerNames - Optional custom names for players
 * @returns Game context with pages in playing phase
 */
export async function setupGameInPlayingPhase(
	browser: Browser,
	playerCount: number = 2,
	playerNames?: string[]
): Promise<GameContext & { roomCode: string }> {
	const names =
		playerNames ||
		Array.from({ length: playerCount }, (_, i) => (i === 0 ? 'HostPlayer' : `Player${i + 1}`));

	const ctx = await createGameContext(browser, playerCount);
	const [hostPage, ...joinerPages] = ctx.pages;

	// Host creates room
	const { code: roomCode } = await createRoom(hostPage, names[0]);

	// Other players join
	for (let i = 0; i < joinerPages.length; i++) {
		await joinRoom(joinerPages[i], roomCode, names[i + 1]);
	}

	// Wait for all players to be visible
	await expect(hostPage.locator(`text=players (${playerCount})`)).toBeVisible({ timeout: 15000 });

	// Wait for sandbox and start game
	await waitForSandboxReady(hostPage);
	await startGame(hostPage);

	return { ...ctx, roomCode };
}

/**
 * Selectors for common game elements.
 * Using data-testid where available, falling back to stable selectors.
 */
export const selectors = {
	// Lobby
	playerList: '[data-testid="player-list"]',
	playerCount: '[data-testid="player-count"]',
	hostBadge: '[data-testid="host-badge"]',
	startButton: '[data-testid="start-game-button"]',
	waitingStatus: '[data-testid="waiting-status"]',
	roomCodeButton: 'button[aria-label*="copy" i]',

	// Playing phase
	roundIndicator: 'text=/round \\d+/i',
	timerDisplay: 'text=/\\d+:\\d+/',
	chatTextarea: '[data-testid="chat-textarea"]',
	submitButton: 'button:has-text("submit")',

	// Review phase
	roundReview: '[data-testid="round-review"]',
	roundCompleteHeader: '[data-testid="round-complete-header"]',
	readyCount: '[data-testid="ready-count"]',
	reviewCountdown: '[data-testid="review-countdown"]',
	continueButton: '[data-testid="continue-button"]',

	// Game over
	gameOver: '[data-testid="game-over"]',
	gameOverTitle: '[data-testid="game-over-title"]',
	podium: '[data-testid="podium"]',
	playAgainButton: '[data-testid="play-again-button"]',
	finalResultsLabel: '[data-testid="final-results-label"]'
};

/**
 * Extended test fixture with game helpers.
 */
export const test = base.extend<{
	gameContext: (playerCount?: number) => Promise<GameContext>;
}>({
	gameContext: async ({ browser }, use) => {
		const contexts: GameContext[] = [];

		const createContext = async (playerCount: number = 2) => {
			const ctx = await createGameContext(browser, playerCount);
			contexts.push(ctx);
			return ctx;
		};

		await use(createContext);

		// Cleanup all contexts after test
		for (const ctx of contexts) {
			await ctx.cleanup();
		}
	}
});

/**
 * Worker-scoped shared room fixture.
 * Creates ONE room with sandbox per worker, shared across all tests in that worker.
 * Tests run serially within a describe block to share the room.
 *
 * Usage:
 * ```ts
 * import { sharedRoomTest } from './fixtures/game';
 *
 * sharedRoomTest.describe.serial('My tests', () => {
 *   sharedRoomTest('test 1', async ({ sharedRoom, browser }) => {
 *     // sharedRoom.code, sharedRoom.hostPage available
 *     // Create joiner pages as needed
 *   });
 * });
 * ```
 */
export const sharedRoomTest = base.extend<
	{
		// Test-scoped: fresh joiner context for each test
		joinerContext: BrowserContext;
		joinerPage: Page;
	},
	{
		// Worker-scoped: shared across all tests in worker
		sharedRoom: SharedRoom;
	}
>({
	// Worker-scoped fixture - created once per worker
	sharedRoom: [
		async ({ browser }, use) => {
			// Create host context and page
			const hostContext = await browser.newContext();
			const hostPage = await hostContext.newPage();

			// Create room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'SharedHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const url = hostPage.url();
			const code = url.split('/').pop()!;

			// Wait for lobby
			await expect(hostPage.locator('text=players')).toBeVisible({ timeout: 15000 });

			const sharedRoom: SharedRoom = {
				code,
				url,
				hostContext,
				hostPage,
				isGameStarted: false
			};

			console.log(`[SharedRoom] Created room ${code} for worker`);

			await use(sharedRoom);

			// Cleanup after all tests in worker
			await hostContext.close();
			await cleanupSandboxes();
			console.log(`[SharedRoom] Cleaned up room ${code}`);
		},
		{ scope: 'worker' }
	],

	// Test-scoped fixture - fresh joiner for each test
	joinerContext: async ({ browser }, use) => {
		const context = await browser.newContext();
		await use(context);
		await context.close();
	},

	joinerPage: async ({ joinerContext }, use) => {
		const page = await joinerContext.newPage();
		await use(page);
	}
});

/**
 * Helper to join a shared room with a new player.
 * Use within sharedRoomTest tests.
 */
export async function joinSharedRoom(
	page: Page,
	roomCode: string,
	playerName: string
): Promise<void> {
	await page.goto('/join');
	await page.fill('input#code', roomCode);
	await page.fill('input#nameInput', playerName);
	await page.waitForTimeout(100);
	await page.click('button[type="submit"]');
	await page.waitForURL(`/${roomCode}`, { timeout: 30000 });
}

/**
 * Start game in shared room (only call once per room).
 * Waits for sandbox to be ready first.
 */
export async function startSharedGame(sharedRoom: SharedRoom): Promise<void> {
	if (sharedRoom.isGameStarted) {
		throw new Error('Game already started in shared room');
	}

	// Wait for sandbox
	await expect(sharedRoom.hostPage.locator('button:has-text("start game")')).toBeEnabled({
		timeout: 60000
	});

	// Start game
	await sharedRoom.hostPage.click('button:has-text("start game")');
	await expect(sharedRoom.hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });

	sharedRoom.isGameStarted = true;
}

export { expect };
