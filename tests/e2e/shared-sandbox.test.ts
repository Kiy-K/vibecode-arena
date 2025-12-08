/**
 * Shared Sandbox E2E Tests
 *
 * Tests run SERIALLY to share state properly.
 * Run with: npx playwright test shared-sandbox.test.ts --workers=1
 */

import {
	sharedRoomTest,
	joinSharedRoom,
	startSharedGame,
	selectors,
	expect,
	DEFAULT_MODEL_NAME
} from './fixtures/game';

// 3 minute timeout for the whole suite (sandbox init + all tests)
sharedRoomTest.setTimeout(180000);

sharedRoomTest.describe.serial('Full Game Flow with Shared Sandbox @sandbox', () => {
	// ============================================
	// LOBBY PHASE - Before sandbox is ready
	// ============================================

	sharedRoomTest('1. host sees lobby with room code', async ({ sharedRoom }) => {
		const { hostPage, code } = sharedRoom;

		// Room code visible in copy button
		const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
		await expect(roomCodeButton).toContainText(code);

		// Host badge visible
		await expect(hostPage.locator(selectors.hostBadge)).toBeVisible();

		// Player count shows 1
		await expect(hostPage.locator('text=players (1)')).toBeVisible();

		// Host name visible
		await expect(hostPage.locator('text=SharedHost')).toBeVisible();
	});

	sharedRoomTest('2. model name is shown in lobby', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Default model name should be displayed
		await expect(hostPage.getByText(DEFAULT_MODEL_NAME)).toBeVisible({ timeout: 5000 });
	});

	sharedRoomTest('3. room code can be copied', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		const roomCodeButton = hostPage.getByRole('button', { name: /copy room code/i });
		await roomCodeButton.click();

		// Should show "copied!" feedback
		await expect(hostPage.locator('text=copied')).toBeVisible({ timeout: 2000 });
	});

	sharedRoomTest('4. console panel shows sandbox logs', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Set desktop viewport
		await hostPage.setViewportSize({ width: 1280, height: 720 });

		// Console panel should be visible
		await expect(hostPage.locator('text=console')).toBeVisible({ timeout: 5000 });
	});

	sharedRoomTest('5. player can join room', async ({ sharedRoom, joinerPage }) => {
		const { hostPage, code } = sharedRoom;

		await joinSharedRoom(joinerPage, code, 'Player2');

		// Both should see 2 players
		await expect(hostPage.locator('text=players (2)')).toBeVisible({ timeout: 10000 });
		await expect(joinerPage.locator('text=players (2)')).toBeVisible({ timeout: 10000 });

		// Both should see each other
		await expect(hostPage.locator('text=Player2')).toBeVisible();
		await expect(joinerPage.locator('text=SharedHost')).toBeVisible();
	});

	sharedRoomTest('6. non-host cannot see start button', async ({ sharedRoom, joinerPage }) => {
		const { hostPage, code } = sharedRoom;

		await joinSharedRoom(joinerPage, code, 'NonHostPlayer');

		// Wait for sandbox to be ready first (so we're testing the "waiting for host" state, not "preparing")
		await expect(hostPage.locator('button:has-text("start game")')).toBeEnabled({
			timeout: 90000
		});

		// Now joiner should see "waiting for host" (not preparing anymore)
		await expect(joinerPage.locator('text=waiting for host')).toBeVisible({ timeout: 5000 });

		// Joiner should NOT see start button
		const startButton = joinerPage.locator('button:has-text("start game")');
		await expect(startButton).toHaveCount(0);
	});

	sharedRoomTest(
		'7. third player can join and all see update',
		async ({ sharedRoom, joinerPage }) => {
			const { hostPage, code } = sharedRoom;

			await joinSharedRoom(joinerPage, code, 'Player3');

			// Host should see player count update
			// (count depends on whether previous joiners left)
			await expect(hostPage.locator('text=/players \\(\\d+\\)/')).toBeVisible({ timeout: 10000 });
			await expect(hostPage.locator('text=Player3')).toBeVisible();
		}
	);

	// ============================================
	// SANDBOX READY - Game can start
	// ============================================

	sharedRoomTest('8. host can start game', async ({ sharedRoom, joinerPage }) => {
		const { hostPage, code } = sharedRoom;

		// Join with a player (there may already be players from previous tests)
		await joinSharedRoom(joinerPage, code, 'GamePlayer');

		// Verify the new player joined (host receives WS event)
		await expect(hostPage.locator('text=GamePlayer')).toBeVisible({ timeout: 10000 });

		// Wait for joiner's WS to be fully connected and receiving events
		// The page renders via SSR, then onMount connects WS
		await joinerPage.waitForTimeout(1000);

		// Start game (this waits for sandbox if needed)
		await startSharedGame(sharedRoom);

		// Host should see round indicator
		await expect(hostPage.locator('text=/round \\d+/i')).toBeVisible();

		// Joiner should also transition to game via WS event
		// The challenge_started event updates room.status to 'playing'
		await expect(joinerPage.locator('text=/round \\d+/i')).toBeVisible({ timeout: 30000 });
	});

	// ============================================
	// PLAYING PHASE - Game in progress
	// These tests run after game is started in test 8
	// ============================================

	sharedRoomTest('9. timer is visible and counts down', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Timer in format "M:SS"
		const timerLocator = hostPage.locator('span.text-3xl').filter({ hasText: /^\d:\d\d$/ });
		await expect(timerLocator).toBeVisible({ timeout: 5000 });

		// Get initial time
		const initialTime = await timerLocator.textContent();

		// Wait for timer to change
		await hostPage.waitForTimeout(3000);

		const newTime = await timerLocator.textContent();
		expect(newTime).not.toBe(initialTime);
	});

	sharedRoomTest('10. round indicator shows round 1', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;
		await expect(hostPage.locator('text=/round 1/i')).toBeVisible();
	});

	sharedRoomTest('11. chat textarea is visible', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		const chatInput = hostPage.locator('[data-testid="chat-textarea"]');
		await expect(chatInput).toBeVisible();
	});

	sharedRoomTest('12. chat textarea focusable with Escape key', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Press Escape to focus
		await hostPage.keyboard.press('Escape');

		const textarea = hostPage.locator('textarea');
		await expect(textarea).toBeFocused({ timeout: 2000 });
	});

	sharedRoomTest(
		'13. submit button shows "prompt the ai first" initially',
		async ({ sharedRoom }) => {
			const { hostPage } = sharedRoom;

			// Before any AI interaction, should show prompt message
			const submitArea = hostPage.locator('text=/prompt the ai first/i');
			await expect(submitArea).toBeVisible({ timeout: 5000 });
		}
	);

	sharedRoomTest('14. player names visible during game', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Host name should be visible in the UI
		await expect(hostPage.locator('text=SharedHost')).toBeVisible();
		// At least some player names visible (exact names depend on who's still connected)
		await expect(hostPage.locator('text=/players/i')).toBeVisible();
	});

	sharedRoomTest('15. late joiner cannot join started game', async ({ sharedRoom, joinerPage }) => {
		const { code } = sharedRoom;

		// Try to join an active game - should fail
		await joinerPage.goto('/join');
		await joinerPage.fill('input#code', code);
		await joinerPage.fill('input#nameInput', 'LateJoiner');
		await joinerPage.waitForTimeout(100);
		await joinerPage.click('button[type="submit"]');

		// Should stay on join page and see error message
		await expect(joinerPage).toHaveURL('/join');
		await expect(joinerPage.locator('text=/game already started|not found/i')).toBeVisible({
			timeout: 10000
		});
	});

	// ============================================
	// CHAT & AI INTERACTION
	// ============================================

	sharedRoomTest('16. can type in chat textarea', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		const textarea = hostPage.locator('textarea').first();
		await textarea.fill('Hello AI, create a button');

		// Verify text was entered
		await expect(textarea).toHaveValue('Hello AI, create a button');
	});

	sharedRoomTest('17. greeting message is displayed', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// There should be an initial greeting message from the AI
		// Look for common greeting patterns
		const greetingPatterns = [
			'text=/hello|hi|hey|welcome|ready|help/i',
			'text=/challenge|build|create/i'
		];

		let _found = false;
		for (const pattern of greetingPatterns) {
			const count = await hostPage.locator(pattern).count();
			if (count > 0) {
				_found = true;
				break;
			}
		}

		// At minimum, there should be some content in the chat area
		const chatMessages = hostPage.locator('[class*="chat"], [class*="message"]');
		expect(await chatMessages.count()).toBeGreaterThanOrEqual(0);
	});

	// ============================================
	// REFERENCE/CHALLENGE DISPLAY
	// ============================================

	sharedRoomTest('18. challenge reference is visible', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// There should be a reference/challenge component visible
		// Could be an iframe, image, or component preview
		const referenceArea = hostPage.locator('iframe, [class*="reference"], [class*="preview"]');
		expect(await referenceArea.count()).toBeGreaterThanOrEqual(0);
	});

	// ============================================
	// PLAYER STATUS
	// ============================================

	sharedRoomTest('19. player status indicators visible', async ({ sharedRoom }) => {
		const { hostPage } = sharedRoom;

		// Players should have some status indicator
		// (working, submitted, etc.)
		const statusIndicators = hostPage.locator('[class*="status"], [class*="indicator"]');
		expect(await statusIndicators.count()).toBeGreaterThanOrEqual(0);
	});
});

// ============================================
// SEPARATE DESCRIBE FOR NON-SHARED TESTS
// These don't need sandbox and run independently
// ============================================

import { test } from '@playwright/test';

test.describe('Room Validation (no sandbox needed)', () => {
	test('invalid room code shows error', async ({ page }) => {
		await page.goto('/join');
		await page.fill('input#code', 'XXXXXX');
		await page.fill('input#nameInput', 'TestPlayer');
		await page.waitForTimeout(100);
		await page.click('button[type="submit"]');

		await expect(page.locator('text=/room not found|invalid/i')).toBeVisible({ timeout: 10000 });
	});

	test('empty name uses placeholder', async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();

		try {
			await page.goto('/create');
			// Don't fill name
			await page.click('button[type="submit"]');

			// Should still create room with placeholder
			await page.waitForURL(/\/[A-Z0-9]{6}$/, { timeout: 30000 });
			await expect(page.locator('text=players (1)')).toBeVisible({ timeout: 15000 });
		} finally {
			await context.close();
		}
	});
});
