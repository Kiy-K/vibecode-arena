.PHONY: dev test smoke judge-smoke daytona-judge-smoke clean

ifneq (,$(wildcard .env))
include .env
export
endif

UV_PROJECT_ENVIRONMENT ?= .venv
UV_CACHE_DIR ?= .uv-cache
UV_LINK_MODE ?= copy
export UV_PROJECT_ENVIRONMENT UV_CACHE_DIR UV_LINK_MODE

UV := uv run

dev:
	$(UV) uvicorn arena.api:app --host 127.0.0.1 --port 8790

test:
	$(UV) pytest tests_python

smoke:
	$(UV) python -m arena.smoke agent

judge-smoke:
	$(UV) python -m arena.smoke judge

daytona-judge-smoke:
	JUDGE_SANDBOX_PROVIDER=daytona $(UV) python -m arena.smoke judge

clean:
	rm -rf .pytest_cache arena/__pycache__ tests_python/__pycache__
