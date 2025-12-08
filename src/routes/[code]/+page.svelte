<script lang="ts">
	import { onMount } from 'svelte';

	import { useGame } from '$lib/hooks/useGame.svelte';
	import { extractCodeBlock } from '$lib/utils/code';
	import { getPageMeta, siteConfig } from '$lib/config/seo';

	import ChallengeCanvas from '$lib/components/ChallengeCanvas.svelte';
	import {
		GameHeader,
		MobileTabs,
		ChatArea,
		CodePanel,
		Lobby,
		CelebrationOverlay,
		GameOver,
		RoundReview,
		PlayerList
	} from '$lib/components/game';

	let { data } = $props();

	const game = useGame({
		room: data.room,
		playerId: data.playerId,
		isHost: data.isHost,
		serverTime: data.serverTime,
		chatHistory: data.chatHistory,
		sandboxUrl: data.sandboxUrl,
		sandboxReady: data.sandboxReady,
		wsUrl: data.wsUrl
	});

	const meta = getPageMeta({
		title: `room ${data.room.code.toLowerCase()}`,
		description: `join the coding competition in room ${data.room.code.toLowerCase()}. ${data.room.players.length} player(s) competing.`,
		noindex: true
	});

	onMount(() => game.setup());
</script>

<svelte:head>
	<title>{meta.title}</title>
	<meta name="description" content={meta.description} />
	<meta name="robots" content="noindex, nofollow" />
	<link rel="canonical" href="{siteConfig.url}/{data.room.code}" />
</svelte:head>

<div class="min-h-screen bg-black text-white">
	{#if game.room.status === 'waiting'}
		<Lobby
			room={game.room}
			playerId={game.playerId}
			isHost={game.isHost}
			sandboxReady={game.sandboxReady}
			sandboxLogs={game.sandboxLogs}
			onStartGame={game.startGame}
		/>
	{:else if game.room.status === 'reviewing' && game.challenge}
		<RoundReview
			players={game.reviewPlayers.length > 0 ? game.reviewPlayers : game.room.players}
			challenge={game.challenge}
			round={game.room.round}
			maxRounds={game.room.maxRounds}
			countdown={game.reviewCountdown}
			readyCount={game.readyCount}
			isReady={game.isReady}
			markingReady={game.markingReady}
			isLastRound={game.room.round >= game.room.maxRounds}
			currentPlayerId={game.playerId}
			onContinue={game.continueToNextRound}
		/>
	{:else if game.room.status === 'playing' && game.challenge}
		<div class="h-screen flex flex-col">
			<GameHeader
				room={game.room}
				player={game.player}
				timeLeft={game.timeLeft}
				submissions={game.submissions}
				promptsUsed={game.promptsUsed}
				sandboxReady={game.sandboxReady}
				submitting={game.submitting}
				formatTime={game.formatTime}
			/>

			<MobileTabs
				activeTab={game.mobileTab}
				onTabChange={game.setMobileTab}
				hasCode={game.codeSource !== null}
				submitted={game.submitted}
			/>

			<div class="flex-1 flex overflow-hidden">
				<!-- Challenge Panel (desktop) -->
				<div
					class="hidden md:flex md:flex-col w-[400px] shrink-0 border-r border-neutral-900 bg-neutral-950/50 overflow-hidden"
				>
					<div class="flex-1 p-4 overflow-auto">
						<ChallengeCanvas challenge={game.challenge} />
					</div>
					<div class="border-t border-neutral-800 p-3">
						<PlayerList
							players={game.room.players}
							currentPlayerId={game.playerId}
							judgingPlayerIds={game.judgingPlayerIds}
						/>
					</div>
				</div>

				<!-- Challenge Panel (mobile) -->
				{#if game.mobileTab === 'challenge'}
					<div class="md:hidden flex-1 p-3 bg-neutral-950/50 overflow-auto">
						<ChallengeCanvas challenge={game.challenge} />
						<div class="mt-4 pt-4 border-t border-neutral-800">
							<PlayerList
								players={game.room.players}
								currentPlayerId={game.playerId}
								judgingPlayerIds={game.judgingPlayerIds}
							/>
						</div>
					</div>
				{/if}

				<!-- Chat + Code -->
				<div
					class="flex-1 flex overflow-hidden {game.mobileTab !== 'chat' ? 'hidden md:flex' : ''}"
				>
					<ChatArea
						messages={game.messages}
						chatLoading={game.chatLoading}
						chatInput={game.chatInput}
						submitted={game.submitted}
						modelId={game.player?.model}
						codeSourceMessageId={game.codeSource?.messageId || null}
						onSend={game.sendChat}
						onInputChange={(v) => (game.chatInput = v)}
						onUseCode={game.selectCode}
						extractCode={extractCodeBlock}
						textareaRef={game.setTextareaRef}
					/>

					<CodePanel
						code={game.activeCode}
						result={game.result}
						submitting={game.submitting}
						submitted={game.submitted}
						hasCodeSource={game.codeSource !== null}
						sandboxUrl={game.sandboxUrl}
						sandboxLogs={game.sandboxLogs}
						onSubmit={game.submit}
					/>
				</div>

				<!-- Code Panel (mobile) -->
				{#if game.mobileTab === 'code'}
					<CodePanel
						code={game.activeCode}
						result={game.result}
						submitting={game.submitting}
						submitted={game.submitted}
						hasCodeSource={game.codeSource !== null}
						sandboxUrl={game.sandboxUrl}
						sandboxLogs={game.sandboxLogs}
						isMobile={true}
						onSubmit={game.submit}
					/>
				{/if}
			</div>

			{#if game.showCelebration}
				<CelebrationOverlay
					earnedScore={game.earnedScore}
					timeTaken={game.timeTaken}
					promptsUsed={game.promptsUsed}
					totalPlayers={game.room.players.length}
					submittedCount={game.submissions.length}
					similarityScore={game.result?.score ?? 0}
					feedback={game.result?.feedback ?? ''}
					formatTime={game.formatTime}
				/>
			{/if}

			{#if game.allSubmitted && !game.showCelebration}
				<div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
					<div class="text-center max-w-md">
						<p
							class="text-2xl font-bold {game.result?.passed
								? 'text-green-500'
								: 'text-red-500'} mb-2"
						>
							{game.result?.passed ? 'Everyone Submitted!' : 'Not Quite!'}
						</p>

						{#if game.result}
							<div class="mb-4 text-lg">
								<span class="text-orange-400 font-mono font-bold">{game.result.score}</span>
								<span class="text-neutral-500">/100 similarity</span>
							</div>

							{#if game.result.feedback}
								<div class="mb-6 px-4 py-3 bg-neutral-900 border border-neutral-800 text-left">
									<p class="text-sm text-neutral-300 leading-relaxed">
										{game.result.feedback}
									</p>
								</div>
							{/if}
						{/if}

						<p class="text-neutral-400 mb-2">Review starting in...</p>
						<p class="text-6xl font-mono font-bold text-orange-500">
							{game.allSubmittedCountdown}
						</p>
					</div>
				</div>
			{/if}

			{#if game.waitingForJudging && !game.showCelebration}
				<div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
					<div class="text-center max-w-md">
						<div class="mb-4">
							<div
								class="w-12 h-12 mx-auto border-4 border-orange-500 border-t-transparent rounded-full animate-spin"
							></div>
						</div>
						<p class="text-2xl font-bold text-orange-500 mb-2">Time's Up!</p>
						<p class="text-neutral-400 mb-4">Waiting for AI analysis to complete...</p>
						<p class="text-sm text-neutral-500">
							{game.judgingCount} player{game.judgingCount !== 1 ? 's' : ''} being analyzed
						</p>
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<GameOver players={game.room.players} currentPlayerId={game.playerId} />
	{/if}
</div>
