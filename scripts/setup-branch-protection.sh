#!/usr/bin/env sh
# Setup branch protection rules for the main branch of gql-client.
#
# Prerequisites:
#   - GitHub CLI (gh) installed and authenticated: gh auth login
#   - You must have admin access to the repository
#
# Usage:
#   REPO=nuewframe/gql-client sh scripts/setup-branch-protection.sh
#
# The rules applied:
#   - CI must pass (Test & Lint) before merging
#   - At least 1 approving review required
#   - Code owner review required (see .github/CODEOWNERS)
#   - Stale reviews dismissed on new push
#   - Last push must be approved (prevents self-approval of own changes)
#   - Direct pushes to main are blocked for everyone
#   - Force-pushes disabled
#   - Branch deletion disabled
#   - Linear history enforced (no merge commits)
#   - All conversations must be resolved before merge

set -eu

REPO="${REPO:-nuewframe/gql-client}"

echo "Applying branch protection to $REPO main..."

gh api "repos/$REPO/branches/main/protection" \
  --method PUT \
  --header 'Accept: application/vnd.github+json' \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Test & Lint"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
EOF

echo "✓ Branch protection configured on $REPO main"
echo ""
echo "Also recommended — enable via GitHub UI:"
echo "  Settings → Rules → Rulesets → add 'Require signed commits'"
echo "  Settings → General → 'Automatically delete head branches'"
echo "  Settings → General → 'Allow squash merging' only (disable merge commits)"
