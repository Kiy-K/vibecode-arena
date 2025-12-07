.PHONY: dev dev-all build check lint format validate install clean deploy-worker e2b-build

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

build-worker:
	npm run build:worker

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
deploy-worker:
	npm run deploy:worker

# E2B Template - API key needed
e2b-build:
	E2B_API_KEY=$$E2B_API_KEY npx tsx sandbox/build.prod.ts

# Help
help:
	@echo "Available commands:"
	@echo "  make dev          - Start SvelteKit dev server"
	@echo "  make dev-worker   - Start Wrangler dev server"
	@echo "  make dev-all      - Start both servers"
	@echo "  make build        - Build for production"
	@echo "  make check        - Run TypeScript checks"
	@echo "  make lint         - Run ESLint"
	@echo "  make format       - Format with Prettier"
	@echo "  make validate     - Run all checks"
	@echo "  make deploy-worker- Deploy Cloudflare Worker"
	@echo "  make e2b-build    - Build and publish E2B template"
