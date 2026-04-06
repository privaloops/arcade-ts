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

if [[ "$CURRENT" == *"-beta."* ]]; then
  BASE=$(echo "$CURRENT" | sed 's/-beta\.[0-9]*//')
  BETA_NUM=$(echo "$CURRENT" | grep -o 'beta\.[0-9]*' | grep -o '[0-9]*')
  NEXT_BETA=$((BETA_NUM + 1))

  echo ""
  echo "  1) beta   → ${BASE}-beta.${NEXT_BETA}"
  echo "  2) stable → ${BASE}"
  echo ""
  read -p "Release type? (1/2) " -n 1 -r
  echo

  if [[ "$REPLY" == "2" ]]; then
    VERSION="$BASE"
    PRERELEASE=false
  else
    VERSION="${BASE}-beta.${NEXT_BETA}"
    PRERELEASE=true
  fi
else
  # Bump minor by default
  MAJOR=$(echo "$CURRENT" | cut -d. -f1)
  MINOR=$(echo "$CURRENT" | cut -d. -f2)
  PATCH=$(echo "$CURRENT" | cut -d. -f3)
  NEXT_MINOR="$MAJOR.$((MINOR + 1)).0"
  NEXT_PATCH="$MAJOR.$MINOR.$((PATCH + 1))"

  echo ""
  echo "  1) beta   → ${NEXT_MINOR}-beta.1"
  echo "  2) patch  → ${NEXT_PATCH}"
  echo "  3) minor  → ${NEXT_MINOR}"
  echo ""
  read -p "Release type? (1/2/3) " -n 1 -r
  echo

  if [[ "$REPLY" == "2" ]]; then
    VERSION="$NEXT_PATCH"
    PRERELEASE=false
  elif [[ "$REPLY" == "3" ]]; then
    VERSION="$NEXT_MINOR"
    PRERELEASE=false
  else
    VERSION="${NEXT_MINOR}-beta.1"
    PRERELEASE=true
  fi
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
npx playwright test --grep-invert "Game Matrix" || fail "E2E tests failed"
pass "E2E tests"

# ── 4. Version bump ──

step "Bumping version to $VERSION"

# Update package.json
VERSION=$VERSION node -e "
const pkg = require('./package.json');
pkg.version = process.env.VERSION;
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update CHANGELOG
DATE=$(date +%Y-%m-%d)
if [[ "$PRERELEASE" == true ]]; then
  sed -i '' "s/## \[Unreleased\]/## [Unreleased]\n\n## [$VERSION] - $DATE/" CHANGELOG.md
else
  # Stable: replace current beta header with stable version
  sed -i '' "s/## \[$CURRENT\].*/## [$VERSION] - $DATE/" CHANGELOG.md
fi

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
git push origin main:beta
git push origin "v$VERSION"

pass "Pushed to origin (main + beta + tag)"

# ── 6. GitHub Release ──

step "GitHub Release"

# Extract changelog for this version
NOTES=$(sed -n "/## \[$VERSION\]/,/## \[/p" CHANGELOG.md | sed '$d')

if [[ "$PRERELEASE" == true ]]; then
  gh release create "v$VERSION" \
    --title "v$VERSION" \
    --notes "$NOTES" \
    --prerelease
else
  gh release create "v$VERSION" \
    --title "v$VERSION" \
    --notes "$NOTES"
fi

pass "GitHub release created"

echo -e "\n${GREEN}Release v$VERSION complete!${NC}"
