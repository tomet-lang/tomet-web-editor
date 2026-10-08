# Tomet Web Editor development tasks.

default:
    @just --list

# Start local development server.
dev:
    pnpm dev

# Build the production bundle.
build:
    pnpm build

# Typecheck TypeScript.
check:
    pnpm typecheck

# Generate and update all derived documentation across the workspace.
docs:
    tomet export .
    tomet format -i .

# Check that all documents parse, format cleanly, and match export targets.
docs-check:
    tomet check .
    tomet format --check .
    tomet export --check .
    @if [ -f .writ.tmt ] && command -v twrit >/dev/null 2>&1; then \
        twrit check .; \
    fi
