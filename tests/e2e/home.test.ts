import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('displays the title and tagline', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('vibecode arena');
		await expect(page.locator('text=competitive ai-assisted coding battles')).toBeVisible();
	});

	test('has create room button', async ({ page }) => {
		const createButton = page.locator('a[href="/create"]');
		await expect(createButton).toBeVisible();
		await expect(createButton).toContainText('create room');
	});

	test('has join room button', async ({ page }) => {
		const joinButton = page.locator('a[href="/join"]');
		await expect(joinButton).toBeVisible();
		await expect(joinButton).toContainText('join room');
	});

	test('navigates to create page on click', async ({ page }) => {
		await page.click('a[href="/create"]');
		await expect(page).toHaveURL('/create');
	});

	test('navigates to join page on click', async ({ page }) => {
		await page.click('a[href="/join"]');
		await expect(page).toHaveURL('/join');
	});

	test('navigates to create page with C key', async ({ page }) => {
		// Wait for page to be fully loaded
		await expect(page.locator('h1')).toBeVisible();
		// Wait for Svelte hydration to complete (event handlers attached)
		await page.waitForTimeout(500);
		// Dispatch keydown event directly to window for reliability
		await page.evaluate(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })
			);
		});
		await expect(page).toHaveURL('/create');
	});

	test('navigates to join page with J key', async ({ page }) => {
		// Wait for page to be fully loaded
		await expect(page.locator('h1')).toBeVisible();
		// Wait for Svelte hydration to complete (event handlers attached)
		await page.waitForTimeout(500);
		// Dispatch keydown event directly to window for reliability
		await page.evaluate(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })
			);
		});
		await expect(page).toHaveURL('/join');
	});

	test('shows feature list on desktop', async ({ page }) => {
		// Set viewport to desktop size
		await page.setViewportSize({ width: 1280, height: 720 });

		await expect(page.locator('text=real-time sandbox preview')).toBeVisible();
		await expect(page.locator('text=multiple AI models to choose from')).toBeVisible();
	});

	test('has footer with credits', async ({ page }) => {
		await expect(page.locator('text=powered by')).toBeVisible();
		await expect(page.locator('a[href="https://e2b.dev"]')).toBeVisible();
	});
});
