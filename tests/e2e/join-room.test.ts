import { test, expect } from '@playwright/test';

test.describe('Join Room Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/join');
	});

	test('displays join room form', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('join room');
		await expect(page.locator('input#code')).toBeVisible();
		await expect(page.locator('input#nameInput')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toContainText('join room');
	});

	test('room code input has correct attributes', async ({ page }) => {
		const codeInput = page.locator('input#code');
		await expect(codeInput).toHaveAttribute('maxlength', '6');
		await expect(codeInput).toHaveAttribute('required', '');
	});

	test('room code input displays uppercase via CSS', async ({ page }) => {
		const codeInput = page.locator('input#code');
		await codeInput.fill('abc123');
		// CSS text-transform makes it display uppercase, value stays lowercase
		// Server converts to uppercase on submit
		await expect(codeInput).toHaveValue('abc123');
		await expect(codeInput).toHaveCSS('text-transform', 'uppercase');
	});

	test('shows back button that navigates home', async ({ page }) => {
		await page.click('text=← back');
		await expect(page).toHaveURL('/');
	});

	test('navigates home with Escape key', async ({ page }) => {
		// Wait for page to be fully loaded
		await expect(page.locator('h1')).toBeVisible();
		// Wait for Svelte hydration to complete (event handlers attached)
		await page.waitForTimeout(500);
		// Dispatch keydown event directly to window for reliability
		await page.evaluate(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
		});
		await expect(page).toHaveURL('/');
	});

	test('has model selection options', async ({ page }) => {
		const modelRadios = page.locator('input[name="model"]');
		await expect(modelRadios.first()).toBeVisible();
	});

	test('shows error for invalid room code', async ({ page }) => {
		// Fill in an invalid room code
		await page.fill('input#code', 'XXXXX1');
		await page.fill('input#nameInput', 'TestPlayer');

		// Submit the form
		await page.click('button[type="submit"]');

		// Should show error (room not found)
		await expect(page.locator('text=Room not found')).toBeVisible({ timeout: 10000 });
	});

	test('accepts code from URL query param', async ({ page }) => {
		await page.goto('/join?code=ABC123');
		const codeInput = page.locator('input#code');
		await expect(codeInput).toHaveValue('ABC123');
	});

	test('shows how it works panel on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });

		await expect(page.locator('text=how it works')).toBeVisible();
		await expect(page.locator('text=enter the room code')).toBeVisible();
	});
});

test.describe('Full Join Flow', () => {
	test('can join an existing room', async ({ browser }) => {
		// Create two browser contexts to simulate two players
		const hostContext = await browser.newContext();
		const joinerContext = await browser.newContext();

		const hostPage = await hostContext.newPage();
		const joinerPage = await joinerContext.newPage();

		try {
			// Host creates a room
			await hostPage.goto('/create');
			await hostPage.fill('input#nameInput', 'HostPlayer');
			// Wait for Svelte binding to propagate to hidden input
			await hostPage.waitForTimeout(100);
			await hostPage.click('button[type="submit"]');

			// Wait for redirect to room
			await hostPage.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });

			// Wait for lobby to be visible (room loaded) - use 'players (1)' which is unique to lobby
			await expect(hostPage.locator('text=players (1)')).toBeVisible({ timeout: 10000 });

			// Extract room code from URL
			const roomCode = hostPage.url().split('/').pop();
			expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

			// Host should see themselves in the player list
			await expect(hostPage.locator('text=HostPlayer')).toBeVisible({ timeout: 10000 });

			// Joiner joins the room
			await joinerPage.goto('/join');
			await joinerPage.fill('input#code', roomCode!);
			await joinerPage.fill('input#nameInput', 'JoinerPlayer');
			// Wait for Svelte binding to propagate to hidden input
			await joinerPage.waitForTimeout(100);
			await joinerPage.click('button[type="submit"]');

			// Joiner should be redirected to the same room
			await joinerPage.waitForURL(`/${roomCode}`, { timeout: 30000 });

			// Wait for joiner's lobby to load - use 'players' text which is unique to lobby
			await expect(joinerPage.locator('text=/players \\(\\d+\\)/')).toBeVisible({ timeout: 10000 });

			// Joiner should see themselves
			await expect(joinerPage.locator('text=JoinerPlayer')).toBeVisible({ timeout: 10000 });

			// Both should see each other - use longer timeout for WebSocket sync
			await expect(joinerPage.locator('text=HostPlayer')).toBeVisible({ timeout: 15000 });
			await expect(hostPage.locator('text=JoinerPlayer')).toBeVisible({ timeout: 15000 });

			// Verify player count shows 2
			await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 5000 });
			await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 5000 });
		} finally {
			await hostContext.close();
			await joinerContext.close();
		}
	});
});
