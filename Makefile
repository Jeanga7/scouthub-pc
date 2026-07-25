SHELL := /bin/sh

.DEFAULT_GOAL := help

.PHONY: help install dev db-up db-down db-ps db-logs migrate db-generate db-studio lint typecheck test build build-workers check ci

help:
	@printf '%s\n' 'ScoutHub Region commands'
	@printf '%s\n' ''
	@printf '%s\n' 'Setup:'
	@printf '%s\n' '  make install        Install pnpm dependencies'
	@printf '%s\n' '  make db-up          Start local PostgreSQL on localhost:5433'
	@printf '%s\n' '  make migrate        Apply Drizzle migrations'
	@printf '%s\n' '  make dev            Start the Next.js dev server'
	@printf '%s\n' ''
	@printf '%s\n' 'Quality gates:'
	@printf '%s\n' '  make lint           Run ESLint and provider boundary check'
	@printf '%s\n' '  make typecheck      Run TypeScript checks'
	@printf '%s\n' '  make test           Run unit tests'
	@printf '%s\n' '  make build          Build all workspaces'
	@printf '%s\n' '  make build-workers  Build OpenNext Cloudflare Workers bundle'
	@printf '%s\n' '  make check          Run lint, typecheck, test, build'
	@printf '%s\n' '  make ci             Run check, Workers build, migrations'
	@printf '%s\n' ''
	@printf '%s\n' 'Database:'
	@printf '%s\n' '  make db-ps          Show local PostgreSQL container status'
	@printf '%s\n' '  make db-logs        Tail local PostgreSQL logs'
	@printf '%s\n' '  make db-down        Stop local PostgreSQL'
	@printf '%s\n' '  make db-generate    Generate Drizzle migration from schema'
	@printf '%s\n' '  make db-studio      Open Drizzle Studio'

install:
	pnpm install

dev:
	pnpm dev

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-ps:
	docker compose ps

db-logs:
	docker compose logs -f postgres

migrate:
	pnpm db:migrate

db-generate:
	pnpm db:generate

db-studio:
	pnpm db:studio

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

build-workers:
	pnpm build:workers

check: lint typecheck test build

ci: check build-workers migrate
