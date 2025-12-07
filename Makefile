.PHONY: dev dev-all build check lint format validate install clean deploy e2b-build

# Development
dev:
	npm run dev

dev-worker:
	npm run dev:worker

dev-all:
	npm run dev:all

# Build
build:
	npm run build

# Quality
check:
	npm run check

lint:
	npm run lint

format:
	npm run format

validate:
	npm run check && npm run lint && npm run format:check

# Setup
install:
	npm install

clean:
	rm -rf .svelte-kit node_modules/.vite

# Deployment
deploy:
	npx wrangler deploy

deploy-secrets:
	@echo "Enter OPENROUTER_API_KEY:" && npx wrangler secret put OPENROUTER_API_KEY
	@echo "Enter E2B_API_KEY:" && npx wrangler secret put E2B_API_KEY

# E2B Template
e2b-build:
	E2B_API_KEY=$$E2B_API_KEY npx tsx sandbox/build.prod.ts

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
