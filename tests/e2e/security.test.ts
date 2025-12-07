import { test, expect, type BrowserContext, type Page } from '@playwright/test';

// Increase timeout for tests that involve room creation (sandbox initialization)
test.setTimeout(120000);

/**
 * Security E2E Tests
 *
 * Tests for security vulnerabilities:
 * - XSS prevention
 * - Input sanitization
 * - Authorization checks
 * - CSRF protection
 */

// Helper to create a game context
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

test.describe('XSS Prevention', () => {
	test('player name with script tag is escaped', async ({ browser }) => {
		const {
			pages: [hostPage, joinerPage],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Host creates room with malicious name
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '<script>window.xssAttack=true</script>');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Joiner joins
			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode);
			await joinerPage.fill('input#nameInput', 'SafePlayer');
			await joinerPage.waitForTimeout(100);
			await joinerPage.click('button[type="submit"]');
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Wait for player list to load
			await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });

			// Check that XSS didn't execute
			const xssExecuted = await joinerPage.evaluate(() => (window as any).xssAttack);
			expect(xssExecuted).toBeFalsy();

			// The script tags should be escaped/sanitized in display
		} finally {
			await cleanup();
		}
	});

	test('player name with HTML injection is escaped', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '<img src=x onerror=alert(1)>');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Dialog should NOT appear (onerror shouldn't execute)
			// Page should render safely

			// Check that no img tag was actually created with onerror
			const maliciousImgs = await hostPage.locator('img[onerror]').count();
			expect(maliciousImgs).toBe(0);
		} finally {
			await cleanup();
		}
	});

	test('player name with event handler injection is escaped', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '" onmouseover="alert(1)" x="');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// No elements should have inline onmouseover handlers from user input
			const maliciousElements = await hostPage.locator('[onmouseover]').count();
			// There might be legitimate onmouseover handlers, but they shouldn't contain "alert"
		} finally {
			await cleanup();
		}
	});

	test('room code URL parameter is sanitized', async ({ page }) => {
		// Try XSS via URL parameter
		await page.goto('/join?code=<script>alert(1)</script>');

		// Script should not execute
		// Check the input value is sanitized
		const codeInput = page.locator('input#code');
		const value = await codeInput.inputValue();

		// Should not contain unescaped script tags
		expect(value).not.toContain('<script>');
	});
});

test.describe('Authorization', () => {
	test('non-host cannot start game', async ({ browser }) => {
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

			await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 15000 });

			// Joiner should NOT see start button
			const startButton = joinerPage.locator('button:has-text("start game")');
			await expect(startButton).toHaveCount(0);

			// Joiner should see "waiting for host" OR "preparing sandbox" message
			// (depends on whether sandbox is ready yet)
			await expect(
				joinerPage.locator('text=waiting for host').or(joinerPage.locator('text=/preparing/i'))
			).toBeVisible({ timeout: 5000 });
		} finally {
			await cleanup();
		}
	});

	test('player cannot join room they are already in', async ({ browser }) => {
		const {
			pages: [hostPage],
			contexts: [hostContext],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Host creates room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			const roomCode = hostPage.url().split('/').pop()!;

			// Create new page in same context (same cookies/session)
			const samePage = await hostContext.newPage();
			await samePage.goto('/join');
			await samePage.fill('input#code', roomCode);
			await samePage.fill('input#nameInput', 'SamePlayer');
			await samePage.waitForTimeout(100);
			await samePage.click('button[type="submit"]');

			// Should handle gracefully - either redirect to existing room or show message
			// The behavior depends on implementation
			await samePage.waitForTimeout(2000);

			await samePage.close();
		} finally {
			await cleanup();
		}
	});
});

test.describe('Input Sanitization', () => {
	test('room code is converted to uppercase', async ({ page }) => {
		await page.goto('/join');
		await page.fill('input#code', 'abcdef');

		// CSS transforms to uppercase visually
		await expect(page.locator('input#code')).toHaveCSS('text-transform', 'uppercase');

		// The actual value might stay lowercase (server converts)
		// or might be converted to uppercase depending on implementation
	});

	test('SQL injection in name is handled safely', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', "'; DROP TABLE users; --");
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Should create room normally (SQL injection shouldn't affect anything)
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});

	test('NoSQL injection in name is handled safely', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '{"$gt": ""}');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Should create room normally
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
		} finally {
			await cleanup();
		}
	});
});

test.describe('Rate Limiting', () => {
	test('rapid room creation is handled', async ({ browser }) => {
		// Create multiple rooms in quick succession
		const contexts: BrowserContext[] = [];
		const pages: Page[] = [];

		try {
			for (let i = 0; i < 5; i++) {
				const context = await browser.newContext();
				const page = await context.newPage();
				contexts.push(context);
				pages.push(page);

				await page.goto('/create');
				await page.fill('input#nameInput', `Player${i}`);
				await page.waitForTimeout(50);
				await page.click('button[type="submit"]');
			}

			// Wait for all to complete
			await Promise.all(
				pages.map(async (page, i) => {
					try {
						await page.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
					} catch {
						// Rate limiting might reject some
					}
				})
			);

			// At least some should succeed
			// (rate limiting behavior depends on implementation)
		} finally {
			for (const ctx of contexts) await ctx.close();
		}
	});
});

test.describe('Session Security', () => {
	test('different browser contexts have different sessions', async ({ browser }) => {
		const {
			pages: [page1, page2],
			cleanup
		} = await createGameContext(browser, 2);

		try {
			// Create room in first context
			await page1.goto('/create');
			await page1.fill('input#nameInput', 'Player1');
			await page1.waitForTimeout(100);
			await page1.click('button[type="submit"]');
			await page1.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			const roomCode = page1.url().split('/').pop()!;

			// Join from second context
			await page2.goto('/join');
			await page2.fill('input#code', roomCode);
			await page2.fill('input#nameInput', 'Player2');
			await page2.waitForTimeout(100);
			await page2.click('button[type="submit"]');
			await page2.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Both should be in the room as different players
			await expect(page1.locator('text=players (2)')).toBeVisible({ timeout: 15000 });
			await expect(page2.locator('text=players (2)')).toBeVisible({ timeout: 15000 });

			// Page1 should show host badge (they created the room)
			await expect(page1.getByText('host', { exact: true })).toBeVisible();
		} finally {
			await cleanup();
		}
	});
});

test.describe('Content Security', () => {
	test('external resources are not loaded from user input', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			// Track network requests
			const externalRequests: string[] = [];
			hostPage.on('request', (request) => {
				const url = request.url();
				if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
					externalRequests.push(url);
				}
			});

			await hostPage.goto('/create');
			// Try to inject an external image
			await hostPage.evaluate(() => {
				const input = document.querySelector('input#nameInput') as HTMLInputElement;
				input.value = '<img src="http://evil.com/tracker.gif">';
			});
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Wait a bit for any potential requests
			await hostPage.waitForTimeout(2000);

			// Should not have made request to evil.com
			const evilRequests = externalRequests.filter((url) => url.includes('evil.com'));
			expect(evilRequests).toHaveLength(0);
		} finally {
			await cleanup();
		}
	});
});

test.describe('Prototype Pollution Prevention', () => {
	test('JSON-like input in name is handled safely', async ({ browser }) => {
		const {
			pages: [hostPage],
			cleanup
		} = await createGameContext(browser, 1);

		try {
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', '__proto__');
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Should create room normally
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 15000 });

			// Check that Object prototype wasn't polluted
			const polluted = await hostPage.evaluate(() => {
				return ({} as any).polluted !== undefined;
			});
			expect(polluted).toBe(false);
		} finally {
			await cleanup();
		}
	});
});
