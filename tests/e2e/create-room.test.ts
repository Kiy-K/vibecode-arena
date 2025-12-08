import { test, expect } from '@playwright/test';

test.describe('Create Room Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/create');
	});

	test('displays create room form', async ({ page }) => {
		await expect(page.locator('h1')).toContainText('create room');
		await expect(page.locator('input#nameInput')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toContainText('create room');
	});

	test('has model selection options', async ({ page }) => {
		// Check that at least one model radio button exists
		const modelRadios = page.locator('input[name="model"]');
		await expect(modelRadios.first()).toBeVisible();
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

	test('name input has max length of 20', async ({ page }) => {
		const nameInput = page.locator('input#nameInput');
		await expect(nameInput).toHaveAttribute('maxlength', '20');
	});

	test('creates room and redirects to game page', async ({ page }) => {
		// Fill in the form
		await page.fill('input#nameInput', 'TestPlayer');

		// Submit the form
		await page.click('button[type="submit"]');

		// Should redirect to a room page (6 character code)
		await expect(page).toHaveURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
	});

	test('shows model multiplier indicators', async ({ page }) => {
		// Check that multiplier badges exist
		await expect(page.locator('text=/\\d+\\.\\d+×/').first()).toBeVisible();
	});

	test('shows how it works panel on desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });

		await expect(page.locator('text=how it works')).toBeVisible();
		await expect(page.locator('text=create a room')).toBeVisible();
		await expect(page.locator('text=share the code with friends')).toBeVisible();
	});
});
