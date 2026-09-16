SHELL := /usr/bin/env
.SHELLFLAGS := bash -eu -o pipefail -c
.DEFAULT_GOAL := help

-include .env
export

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
OBSIDIAN_VAULT ?= $(HOME)/Obsidian/SELF
VAULT ?= $(OBSIDIAN_VAULT)
VAULT_EXPANDED := $(patsubst ~/%,$(HOME)/%,$(VAULT))
PLUGIN_ID := repeat-previous-action
PLUGIN_DIR := $(abspath $(VAULT_EXPANDED))/.obsidian/plugins/$(PLUGIN_ID)
VERSION := $(shell node -p "require('./manifest.json').version")
ARTIFACTS := main.js manifest.json

.PHONY: help install dev build typecheck lint format test test-watch check clean \
	validate-vault link symlink unlink reload require-version require-bump \
	prepare-release validate-release release tag-release cut-release \
	release-patch release-minor release-major

help: ## List available targets.
	@printf '%s\n' 'Repeat Previous Action development targets' ''
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z0-9_-]+:.*## / { printf "  %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\nOverride the vault with: make <target> VAULT=/path/to/vault\n'

install: ## Install development dependencies.
	pnpm install

dev: symlink ## Link the plugin and start the development watcher.
	pnpm dev

build: ## Build the production plugin bundle.
	pnpm build

typecheck: ## Type-check the project.
	pnpm typecheck

lint: ## Run ESLint with zero warnings.
	pnpm lint

format: ## Format supported source files.
	pnpm format

test: ## Run the test suite once.
	pnpm test

test-watch: ## Run tests in watch mode.
	pnpm test:watch

check: ## Run formatting, lint, type, coverage, and build checks.
	pnpm check

clean: ## Remove generated build and coverage output.
	rm -rf main.js coverage

validate-vault: ## Verify VAULT is an Obsidian vault.
	@if [ -z "$(strip $(VAULT))" ]; then \
		echo 'VAULT must not be empty.' >&2; \
		exit 1; \
	fi
	@if [ ! -d "$(abspath $(VAULT_EXPANDED))/.obsidian" ]; then \
		echo 'Not an Obsidian vault: $(abspath $(VAULT_EXPANDED))' >&2; \
		exit 1; \
	fi

link: build validate-vault ## Copy plugin artifacts into the selected vault.
	@if [ -e "$(PLUGIN_DIR)" ] && [ ! -d "$(PLUGIN_DIR)" ]; then \
		echo 'Plugin path exists and is not a directory: $(PLUGIN_DIR)' >&2; \
		exit 1; \
	fi
	@mkdir -p "$(PLUGIN_DIR)"
	@rm -f "$(PLUGIN_DIR)/main.js" "$(PLUGIN_DIR)/manifest.json" "$(PLUGIN_DIR)/styles.css"
	@for artifact in $(ARTIFACTS); do install -m 0644 "$$artifact" "$(PLUGIN_DIR)/$$artifact"; done
	@echo 'Installed $(PLUGIN_ID) in $(PLUGIN_DIR)'

symlink: build validate-vault ## Symlink plugin artifacts into the selected vault.
	@if [ -e "$(PLUGIN_DIR)" ] && [ ! -d "$(PLUGIN_DIR)" ]; then \
		echo 'Plugin path exists and is not a directory: $(PLUGIN_DIR)' >&2; \
		exit 1; \
	fi
	@mkdir -p "$(PLUGIN_DIR)"
	@rm -f "$(PLUGIN_DIR)/main.js" "$(PLUGIN_DIR)/manifest.json" "$(PLUGIN_DIR)/styles.css"
	@for artifact in $(ARTIFACTS); do ln -s "$(ROOT_DIR)/$$artifact" "$(PLUGIN_DIR)/$$artifact"; done
	@echo 'Linked $(PLUGIN_ID) in $(PLUGIN_DIR)'

unlink: validate-vault ## Remove the plugin from the selected vault.
	rm -rf "$(PLUGIN_DIR)"
	@echo 'Removed $(PLUGIN_DIR)'

reload: symlink ## Relink artifacts and trigger Obsidian Hot Reload.
	@touch "$(PLUGIN_DIR)/.hotreload"
	@echo 'Requested reload for $(PLUGIN_ID)'

require-version:
	@if [ "$(origin VERSION)" != 'command line' ] || [ -z "$(strip $(VERSION))" ]; then \
		echo 'VERSION is required. Example: make $@ VERSION=1.2.3' >&2; \
		exit 1; \
	fi

require-bump:
	@if [ "$(origin BUMP)" != 'command line' ] || [ -z "$(strip $(BUMP))" ]; then \
		echo 'BUMP is required. Choose patch, minor, or major.' >&2; \
		exit 1; \
	fi

prepare-release: require-version ## Update release files for VERSION.
	pnpm release:tool prepare "$(VERSION)"

validate-release: require-version ## Validate release files for VERSION.
	pnpm release:tool validate "$(VERSION)"

release: require-version validate-release check ## Validate and build root release artifacts.
	@for artifact in $(ARTIFACTS); do test -f "$$artifact"; done
	@printf 'Release %s is ready:\n' "$(VERSION)"
	@for artifact in $(ARTIFACTS); do printf '  %s/%s\n' "$(ROOT_DIR)" "$$artifact"; done

tag-release: require-version release ## Create an annotated local tag for VERSION.
	pnpm release:tool pretag "$(VERSION)"

cut-release: require-bump ## Prepare, verify, commit, and tag a local release.
	pnpm release:tool cut "$(BUMP)"

release-patch: ## Cut the next patch release locally.
	$(MAKE) cut-release BUMP=patch

release-minor: ## Cut the next minor release locally.
	$(MAKE) cut-release BUMP=minor

release-major: ## Cut the next major release locally.
	$(MAKE) cut-release BUMP=major
