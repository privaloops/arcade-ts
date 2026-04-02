#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "\n${YELLOW}▶ $1${NC}"; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── 1. Pre-checks ──

step "Pre-checks"

if [ -n "$(git status --porcelain)" ]; then
  fail "Working directory not clean. Commit or stash changes first."
fi

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  fail "Must be on main branch (currently on $BRANCH)"
fi

pass "On main, working directory clean"

# ── 2. Determine version ──

step "Version"

CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"

# Check if this is a beta bump or first beta
if [[ "$CURRENT" == *"-beta."* ]]; then
  # Bump beta number
  BASE=$(echo "$CURRENT" | sed 's/-beta\.[0-9]*//')
  BETA_NUM=$(echo "$CURRENT" | grep -o 'beta\.[0-9]*' | grep -o '[0-9]*')
  NEXT_BETA=$((BETA_NUM + 1))
  VERSION="${BASE}-beta.${NEXT_BETA}"
else
  VERSION="${CURRENT}-beta.1"
fi

echo "Next version: $VERSION"
read -p "Proceed with $VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ── 3. Tests ──

step "Unit tests"
npm test || fail "Unit tests failed"
pass "Unit tests"

step "Build"
npm run build || fail "Build failed"
pass "Build"

step "E2E tests (Chromium + Firefox, sans game-matrix)"
npx playwright test --ignore-pattern=game-matrix.spec.ts || fail "E2E tests failed"
pass "E2E tests"

step "Game matrix (Chromium only)"
npx playwright test tests/e2e/game-matrix.spec.ts --project=chromium || fail "Game matrix failed"
pass "Game matrix"

# ── 4. Version bump ──

step "Bumping version to $VERSION"

# Update package.json
VERSION=$VERSION node -e "
const pkg = require('./package.json');
pkg.version = process.env.VERSION;
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update CHANGELOG: [Unreleased] → [VERSION] - DATE
DATE=$(date +%Y-%m-%d)
sed -i '' "s/## \[Unreleased\]/## [Unreleased]\n\n## [$VERSION] - $DATE/" CHANGELOG.md

pass "Version bumped to $VERSION"

# ── 5. Git ──
# Exception: release commits directly on main (version bump + changelog only, after all tests pass)

step "Git commit + tag"

git add package.json CHANGELOG.md
git commit -m "chore: release $VERSION"
git tag "v$VERSION"

pass "Committed and tagged v$VERSION"

step "Push"
git push origin main
git push origin "v$VERSION"

pass "Pushed to origin"

# ── 6. GitHub Release ──

step "GitHub Release"

# Extract changelog for this version
NOTES=$(sed -n "/## \[$VERSION\]/,/## \[/p" CHANGELOG.md | sed '$d')

gh release create "v$VERSION" \
  --title "v$VERSION" \
  --notes "$NOTES" \
  --prerelease

pass "GitHub release created"

echo -e "\n${GREEN}🎉 Release v$VERSION complete!${NC}"
