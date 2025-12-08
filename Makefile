.PHONY: dev dev-all build check lint format validate install clean deploy e2b-build

# Development
dev:
	bun run dev

dev-worker:
	bun run dev:worker

dev-all:
	bun run dev:all

# Build
build:
	bun run build

# Quality
check:
	bun run check

lint:
	bun run lint

format:
	bun run format

validate:
	bun run check && bun run lint && bun run format:check

validate-fix:
	bun run check && bun run lint && bun run format

# Setup
install:
	bun install

clean:
	rm -rf .svelte-kit node_modules/.vite

# Deployment
deploy:
	bun run wrangler deploy

deploy-secrets:
	@echo "Enter OPENROUTER_API_KEY:" && npx wrangler secret put OPENROUTER_API_KEY
	@echo "Enter E2B_API_KEY:" && npx wrangler secret put E2B_API_KEY

# E2B Template
e2b-build:
	E2B_API_KEY=$$E2B_API_KEY npx tsx sandbox/build.prod.ts

kill-all:
	@echo "Killing processes on ports 5173 and 8788..."
	lsof -ti:5173,8788 | xargs kill -9 2>/dev/null || echo "No processes found"


# Help
help:
	@echo "Available commands:"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start SvelteKit dev server"
	@echo "  make dev-worker     - Start Wrangler dev server"
	@echo "  make dev-all        - Start both servers"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build SvelteKit for production"
	@echo ""
	@echo "Quality:"
	@echo "  make check          - Run TypeScript checks"
	@echo "  make lint           - Run ESLint"
	@echo "  make format         - Format with Prettier"
	@echo "  make validate       - Run all checks"
	@echo ""
	@echo "Deployment:"
	@echo "  make deploy         - Deploy Worker via wrangler"
	@echo "  make deploy-secrets - Set Worker secrets"
	@echo "  make e2b-build      - Build and publish E2B template"
