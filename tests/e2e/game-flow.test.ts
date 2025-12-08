import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { selectors, DEFAULT_MODEL_NAME } from './fixtures/game';

/**
 * Game Flow E2E Tests - NON-SANDBOX
 *
 * These tests cover game functionality that doesn't require waiting for sandbox:
 * - Lobby creation and joining
 * - Player list updates
 * - UI elements
 *
 * For sandbox-dependent tests (game start, playing phase, etc.),
 * see shared-sandbox.test.ts which shares ONE sandbox across all tests.
 */

// Shorter timeout since these don't need sandbox
test.setTimeout(60000);

// Helper to create a game context with host and players
async function createGameContext(
	browser: Browser,
	playerCount = 2
): Promise<{ pages: Page[]; contexts: BrowserContext[]; cleanup: () => Promise<void> }> {
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
			const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
			await expect(roomCodeButton).toBeVisible();
			await expect(roomCodeButton).toContainText(roomCode!);

			// Host badge
			await expect(hostPage.locator(selectors.hostBadge)).toBeVisible();
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

	test('non-host sees waiting message', async ({ browser }) => {
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

			await expect(joinerPage.locator('text=/players \\(\\d+\\)/')).toBeVisible({ timeout: 15000 });

			// Joiner should see "waiting for host" or "preparing" message
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

			// Click on room code copy button
			const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
			await roomCodeButton.click();

			// Should show "copied!" feedback
			await expect(hostPage.locator('text=copied')).toBeVisible({ timeout: 2000 });
		} finally {
			await cleanup();
		}
	});

	test('console panel visible on desktop', async ({ browser }) => {
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

			// Set desktop viewport
			await hostPage.setViewportSize({ width: 1280, height: 720 });

			// Console panel should show
			await expect(hostPage.locator('text=console')).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('Multiplayer Sync', () => {
	test('multiple players join in real-time', async ({ browser }) => {
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
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Model name should be displayed next to player
			await expect(hostPage.getByText(DEFAULT_MODEL_NAME)).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});
});
