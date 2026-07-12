.DEFAULT_GOAL := help

.PHONY: help install run dev test build check clean

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies with Bun
	bun install

run: ## Start the interactive CLI agent
	bun run src/run.ts

dev: run ## Start the agent in development mode

test: ## Run the test suite
	bun test

build: ## Bundle the CLI into dist/
	bun build src/run.ts --target=bun --outdir=dist

check: test build ## Run tests and verify the production bundle

clean: ## Remove generated build output
	rm -rf dist
