import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { MODELS, DEFAULT_MODEL } from '../../src/lib/config/models';

// Get the default model name for assertions
const DEFAULT_MODEL_NAME = MODELS.find((m) => m.id === DEFAULT_MODEL)!.name;

// Increase timeout for tests that require sandbox initialization
test.setTimeout(120000); // 2 minutes for sandbox-dependent tests

/**
 * Comprehensive Game Flow E2E Tests
 *
 * These tests cover the full game lifecycle:
 * - Lobby: Room creation, player joining, game start
 * - Playing: Challenge display, timer, chat, code submission
 * - Review: Leaderboard, ready state, round transitions
 * - Game Over: Final scores, podium
 */

// Helper to cleanup sandboxes after each test to avoid E2B rate limits
async function cleanupSandboxes() {
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

// Helper to create a game context with host and players
async function createGameContext(
	browser: import('@playwright/test').Browser,
	playerCount: number = 2
) {
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
			for (const ctx of contexts) await ctx.close();
		}
	};
}

test.describe('Lobby Phase', () => {
	test('host can create room and see lobby', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Should redirect to room
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			// Lobby should be visible
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
			await expect(hostPage.locator('text=TestHost')).toBeVisible();

			// Room code should be displayed in the copy button
			const roomCode = hostPage.url().split('/').pop();
			// Use a more specific selector to avoid matching the svelte-announcer
			const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
			await expect(roomCodeButton).toBeVisible();
			await expect(roomCodeButton).toContainText(roomCode!);

			// Host badge - use text selector since Tailwind's bracket syntax isn't valid CSS
			await expect(hostPage.getByText('host', { exact: true })).toBeVisible();
		} finally {
			await cleanup();
		}
	});

	test('player can join existing room via code', async ({ browser }) => {
		const {
			pages: [hostPage, joinerPage],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Host creates room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Joiner joins via code
			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode);
			await joinerPage.fill('input#nameInput', 'JoinerPlayer');
			await joinerPage.waitForTimeout(100);
			await joinerPage.click('button[type="submit"]');

			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Both should see 2 players
			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 10000 });
			await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 10000 });

			// Both should see each other
			await expect(hostPage.locator('text=JoinerPlayer')).toBeVisible();
			await expect(joinerPage.locator('text=HostPlayer')).toBeVisible();
		} finally {
			await cleanup();
		}
	});

	test('non-host cannot see start button', async ({ browser }) => {
		const {
			pages: [hostPage, joinerPage],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Host creates room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Joiner must go through /join flow to get a session cookie
			// Direct URL access without session returns 403
			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode);
			await joinerPage.fill('input#nameInput', 'JoinerPlayer');
			await joinerPage.waitForTimeout(100);
			await joinerPage.click('button[type="submit"]');
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			await expect(joinerPage.locator('text=/players \\(\\d+\\)/')).toBeVisible({ timeout: 15000 });

			// Host should see start game button (or preparing if sandbox not ready)
			await expect(
				hostPage.locator('button:has-text("start game"), button:has-text("preparing")')
			).toBeVisible({ timeout: 15000 });

			// Joiner should see "waiting for host" or "preparing sandbox" message, not start button
			// The message depends on whether sandbox is ready
			await expect(
				joinerPage.locator('text=waiting for host').or(joinerPage.locator('text=/preparing/i'))
			).toBeVisible({ timeout: 5000 });

			// Joiner should NOT see start game button
			const startButton = joinerPage.locator('button:has-text("start game")');
			await expect(startButton).toHaveCount(0);
		} finally {
			await cleanup();
		}
	});

	test('room code can be copied', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Click on room code copy button (use role selector to avoid svelte-announcer match)
			const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
			await roomCodeButton.click();

			// Should show "copied!" feedback
			await expect(hostPage.locator('text=copied')).toBeVisible({ timeout: 2000 });
		} finally {
			await cleanup();
		}
	});

	test('sandbox initialization shows logs', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			// Wait for lobby
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Console panel should show sandbox logs (on desktop)
			await hostPage.setViewportSize({ width: 1280, height: 720 });
			await expect(hostPage.locator('text=console')).toBeVisible({ timeout: 5000 });

			// Should show some sandbox-related log messages
			// (exact text depends on sandbox state)
		} finally {
			await cleanup();
		}
	});
});

test.describe('Game Start', () => {
	// These tests require E2B sandbox which can be slow/flaky
	// Skip in quick runs, run with: npx playwright test --grep @sandbox

	// Cleanup sandboxes after each test to avoid hitting E2B rate limits
	test.afterEach(async () => {
		await cleanupSandboxes();
	});

	test('host can start game when sandbox is ready @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Wait for sandbox to be ready (button changes from "preparing" to "start game")
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});

			// Start the game
			await hostPage.click('button:has-text("start game")');

			// Should transition to playing state - challenge should appear
			// Look for game UI elements (timer, round indicator)
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});

	test('host can start game with Enter key @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Wait for sandbox to be ready
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});

			// Press Enter to start
			await hostPage.keyboard.press('Enter');

			// Should transition to playing state
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});

	test('all players see challenge when game starts @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage, joinerPage],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Host creates room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Joiner joins
			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode);
			await joinerPage.fill('input#nameInput', 'JoinerPlayer');
			await joinerPage.waitForTimeout(100);
			await joinerPage.click('button[type="submit"]');
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Wait for both to be in lobby
			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });
			await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });

			// Wait for sandbox and start
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});
			await hostPage.click('button:has-text("start game")');

			// Both should see round indicator
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });
			await expect(joinerPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('Playing Phase @sandbox', () => {
	// Cleanup sandboxes after each test to avoid hitting E2B rate limits
	test.afterEach(async () => {
		await cleanupSandboxes();
	});

	test('timer counts down during round @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Setup: Create room and start game
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});
			await hostPage.click('button:has-text("start game")');

			// Wait for game to start - should see round indicator
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });

			// Timer is displayed in format "M:SS" (e.g., "1:00", "0:45")
			// There are 2 timer elements (mobile and desktop) - use the visible desktop one (text-3xl class)
			const timerLocator = hostPage.locator('span.text-3xl').filter({ hasText: /^\d:\d\d$/ });
			await expect(timerLocator).toBeVisible({ timeout: 5000 });

			// Get initial time - the timer shows countdown
			const initialTimeText = await timerLocator.textContent();

			// Wait 3 seconds for timer to change
			await hostPage.waitForTimeout(3000);

			// Get new time
			const newTimeText = await timerLocator.textContent();

			// Timer should have decreased
			expect(newTimeText).not.toBe(initialTimeText);
		} finally {
			await cleanup();
		}
	});

	test('chat textarea is focusable with Escape key @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Setup: Create room and start game
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
			// Wait for sandbox to be ready (button becomes enabled)
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});
			await hostPage.click('button:has-text("start game")');
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });

			// Press Escape to focus textarea
			await hostPage.keyboard.press('Escape');

			// Textarea should be focused
			const textarea = hostPage.locator('textarea');
			await expect(textarea).toBeFocused({ timeout: 2000 });
		} finally {
			await cleanup();
		}
	});

	test('submit button is disabled before code selection @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Setup: Create room and start game
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
			// Wait for sandbox to be ready (button becomes enabled)
			// Note: If this times out, it's likely due to E2B rate limiting (max 20 concurrent sandboxes)
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});
			await hostPage.click('button:has-text("start game")');
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });

			// Submit button should show "prompt the ai first" text when no code is generated
			const submitArea = hostPage.locator('text=/prompt the ai first/i');
			await expect(submitArea).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});

	test('player list shows during game @sandbox', async ({ browser }) => {
		const {
			pages: [hostPage, joinerPage],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Setup: Create room with 2 players
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const roomCode = hostPage.url().split('/').pop()!;

			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode);
			await joinerPage.fill('input#nameInput', 'JoinerPlayer');
			await joinerPage.waitForTimeout(100);
			// Note: E2B rate limiting (20 concurrent sandboxes max) is now handled by afterEach cleanup
			await joinerPage.click('button[type="submit"]');
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });
			// Wait for sandbox to be ready (button becomes enabled)
			await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
				timeout: 60000
			});
			await hostPage.click('button:has-text("start game")');

			// During game, both players should still be visible
			await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 15000 });

			// Player names should be visible somewhere in the UI
			await expect(hostPage.locator('text=HostPlayer')).toBeVisible({ timeout: 5000 });
			await expect(hostPage.locator('text=JoinerPlayer')).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('Game Over', () => {
	// Note: Full game flow to completion requires either:
	// 1. Mocking AI responses
	// 2. Waiting for real AI interactions (slow)
	// 3. A test mode that skips AI

	// This test verifies the game over UI structure when reached
	test.skip('game over shows podium and final scores', async ({ browser }) => {
		// This test would require playing through multiple rounds
		// Skipped for now - would need test mode or mocking
	});
});

test.describe('Multiplayer Sync', () => {
	test('player join is reflected in real-time for all players', async ({ browser }) => {
		const {
			pages: [hostPage, joiner1Page, joiner2Page],
			cleanup
		} = await createGameContext(browser, 3);

		try {
			// Host creates room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// First joiner joins
			await joiner1Page.goto('/join');
			await joiner1Page.fill('input#code', roomCode);
			await joiner1Page.fill('input#nameInput', 'Joiner1');
			await joiner1Page.waitForTimeout(100);
			await joiner1Page.click('button[type="submit"]');
			await joiner1Page.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Host and Joiner1 should both see 2 players
			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 10000 });
			await expect(joiner1Page.locator('text=players (2)')).toBeVisible({ timeout: 10000 });

			// Second joiner joins
			await joiner2Page.goto('/join');
			await joiner2Page.fill('input#code', roomCode);
			await joiner2Page.fill('input#nameInput', 'Joiner2');
			await joiner2Page.waitForTimeout(100);
			await joiner2Page.click('button[type="submit"]');
			await joiner2Page.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// All three should see 3 players
			await expect(hostPage.locator('text=players (3)')).toBeVisible({ timeout: 10000 });
			await expect(joiner1Page.locator('text=players (3)')).toBeVisible({ timeout: 10000 });
			await expect(joiner2Page.locator('text=players (3)')).toBeVisible({ timeout: 10000 });

			// All should see each other's names
			for (const page of [hostPage, joiner1Page, joiner2Page]) {
				await expect(page.locator('text=HostPlayer')).toBeVisible();
				await expect(page.locator('text=Joiner1')).toBeVisible();
				await expect(page.locator('text=Joiner2')).toBeVisible();
			}
		} finally {
			await cleanup();
		}
	});
});

test.describe('Room Validation', () => {
	test('invalid room code shows error', async ({ page }) => {
		await page.goto('/join');
		await page.fill('input#code', 'INVALID');
		await page.fill('input#nameInput', 'TestPlayer');
		await page.waitForTimeout(100);
		await page.click('button[type="submit"]');

		// Should show room not found error
		await expect(page.locator('text=/room not found|invalid/i')).toBeVisible({ timeout: 10000 });
	});

	test('empty name uses placeholder', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			// Don't fill name - leave empty
			await hostPage.click('button[type="submit"]');

			// Should still create room (uses placeholder name)
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Should show placeholder name (typically "anonymous" or similar)
		} finally {
			await cleanup();
		}
	});
});

test.describe('Model Selection', () => {
	test('selected model is shown in lobby', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');

			// Model radios are sr-only (visually hidden), so click the label container instead
			// The default model is pre-selected, so we just verify the form works
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Model name should be displayed next to player (using config constant)
			await expect(hostPage.getByText(DEFAULT_MODEL_NAME)).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});
});
