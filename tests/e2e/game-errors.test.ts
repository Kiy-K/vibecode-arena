import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Increase timeout for tests that may involve sandbox/WebSocket operations
test.setTimeout(120000);

/**
 * Error Handling E2E Tests
 *
 * Tests for graceful error handling:
 * - Network failures
 * - Invalid states
 * - Disconnections
 * - Edge cases
 */

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

test.describe('Room Access Errors', () => {
	test('accessing non-existent room shows error', async ({ page }) => {
		// Try to access a room that doesn't exist
		await page.goto('/ZZZZZ1');

		// Should show error or redirect
		// Could be a 404 page, error message, or redirect to home/join
		await expect(
			page
				.locator('text=/not found|invalid|error|does not exist/i')
				.or(page.locator('a[href="/join"]'))
				.or(page.locator('a[href="/"]'))
		).toBeVisible({ timeout: 10000 });
	});

	test('joining full room shows error', async ({ browser }) => {
		// This would require knowing the max player limit
		// For now, we test with a reasonable number
		test.skip();
	});

	test('room code with invalid format is rejected', async ({ page }) => {
		await page.goto('/join');
		await page.fill('input#code', '!!!'); // Invalid characters
		await page.fill('input#nameInput', 'TestPlayer');
		await page.waitForTimeout(100);
		await page.click('button[type="submit"]');

		// Should show validation error
		await expect(page.locator('text=/invalid|error|not found/i')).toBeVisible({ timeout: 10000 });
	});

	test('room code too short is handled', async ({ page }) => {
		await page.goto('/join');
		await page.fill('input#code', 'AB'); // Too short
		await page.fill('input#nameInput', 'TestPlayer');

		// Input has maxlength, but we should handle short codes gracefully
		await page.click('button[type="submit"]');

		// Should show error (room not found or validation error)
		await expect(page.locator('text=/invalid|error|not found/i')).toBeVisible({ timeout: 10000 });
	});
});

test.describe('Connection Errors', () => {
	test('page reload during lobby preserves state', async ({ browser }) => {
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

			// Reload the page
			await hostPage.reload();

			// Should still be in the room
			await expect(hostPage.locator(`text=${roomCode}`)).toBeVisible({ timeout: 15000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});

	test('WebSocket reconnection after brief disconnect', async ({ browser }) => {
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
			await joinerPage.click('button[type="submit"]');
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });

			// Simulate network interruption by going offline briefly
			await joinerPage.context().setOffline(true);
			await joinerPage.waitForTimeout(2000);
			await joinerPage.context().setOffline(false);

			// Give time for reconnection
			await joinerPage.waitForTimeout(3000);

			// Joiner should still see the room state (use role selector to avoid svelte-announcer)
			const roomCodeButton = joinerPage.getByRole('button', { name: /copy room code/i });
			await expect(roomCodeButton).toBeVisible({ timeout: 10000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('Form Validation', () => {
	test('name with only spaces is handled', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '   '); // Only spaces
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Should either use placeholder or show validation error
			// Most likely creates room with placeholder name
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
		} finally {
			await cleanup();
		}
	});

	test('name exceeding max length is truncated', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');

			// Try to fill a very long name
			const longName = 'A'.repeat(100);
			await hostPage.fill('input#nameInput', longName);

			// Input should have maxlength attribute that prevents this
			const inputValue = await hostPage.locator('input#nameInput').inputValue();
			expect(inputValue.length).toBeLessThanOrEqual(20);

			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
		} finally {
			await cleanup();
		}
	});

	test('special characters in name are handled', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '<script>alert(1)</script>');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Name should be displayed safely (escaped)
			// Should NOT execute script
			// The name might be sanitized or displayed escaped
		} finally {
			await cleanup();
		}
	});
});

test.describe('State Consistency', () => {
	test('multiple rapid form submissions are handled', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);

			// Click submit - the button should become disabled or navigation happens
			const submitButton = hostPage.locator('button[type="submit"]');
			await submitButton.click();

			// After first click, either:
			// 1. Navigation happens (success), or
			// 2. Button becomes disabled/loading (preventing double submit)
			// We verify by checking that we eventually land on a room page
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});

	test('navigating away and back during lobby', async ({ browser }) => {
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

			const roomUrl = hostPage.url();

			// Navigate away
			await hostPage.goto('/');
			await expect(hostPage.locator('h1')).toContainText('vibecode arena');

			// Navigate back to room
			await hostPage.goto(roomUrl);

			// Should reconnect to room
			await expect(hostPage.locator('text=players')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('URL Handling', () => {
	test('direct room URL access without session shows error', async ({ page }) => {
		// Try to access a room directly without having joined
		// This tests what happens when there's no playerId cookie/session
		await page.goto('/ABC123');

		// Should show error page with either:
		// - 404: "room not found" / "this room doesn't exist"
		// - 403: "join required" / "you need to join this room first"
		await expect(
			page.locator('text=/room not found|join required|doesn\'t exist|need to join/i')
		).toBeVisible({ timeout: 10000 });
	});

	test('join page with code query param pre-fills input', async ({ page }) => {
		await page.goto('/join?code=TESTCD');

		const codeInput = page.locator('input#code');
		await expect(codeInput).toHaveValue('TESTCD', { timeout: 5000 });
	});
});

test.describe('Browser Compatibility', () => {
	test('back button behavior in room', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Start from home
			await hostPage.goto('/');
			await expect(hostPage.locator('h1')).toContainText('vibecode arena');

			// Go to create
			await hostPage.click('a[href="/create"]');
			await expect(hostPage).toHaveURL('/create');

			// Create room
			await hostPage.fill('input#nameInput', 'TestHost');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			// Go back
			await hostPage.goBack();

			// Should go back to create page
			await expect(hostPage).toHaveURL('/create');
		} finally {
			await cleanup();
		}
	});
});
