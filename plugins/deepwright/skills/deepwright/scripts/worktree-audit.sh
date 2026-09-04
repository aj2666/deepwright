#!/usr/bin/env bash
# Strictly local, read-only worktree audit. It never fetches, prunes, deletes,
# contacts a forge, or inspects editor/agent application data. Every dirty
# worktree is held for an explicit user decision, including untracked-only work.
set -uo pipefail

usage() {
	echo "Usage: worktree-audit.sh [repo-path] [default-branch-or-ref]" >&2
}

if [ "$#" -gt 2 ]; then
	usage
	exit 64
fi

git_ro() {
	GIT_OPTIONAL_LOCKS=0 git --no-optional-locks "$@"
}

repo_input=${1:-.}
if ! repo=$(git_ro -C "$repo_input" rev-parse --show-toplevel 2>/dev/null); then
	echo "not a git repository: $repo_input" >&2
	exit 2
fi
if ! repo=$(cd "$repo" 2>/dev/null && pwd -P); then
	echo "cannot resolve repository path: $repo" >&2
	exit 2
fi

default_input=${2:-}
default_branch=""
default_ref=""

use_default_ref() {
	local candidate=$1
	local label=$2
	if git_ro -C "$repo" rev-parse --verify --quiet "${candidate}^{commit}" >/dev/null; then
		default_ref=$candidate
		default_branch=$label
		return 0
	fi
	return 1
}

if [ -n "$default_input" ]; then
	use_default_ref "$default_input" "${default_input##*/}" ||
		use_default_ref "refs/heads/$default_input" "$default_input" ||
		use_default_ref "refs/remotes/$default_input" "${default_input##*/}" || {
			echo "default branch/ref is not available locally: $default_input" >&2
			exit 2
		}
else
	remote_head=$(git_ro -C "$repo" for-each-ref \
		--format='%(refname) %(symref)' 'refs/remotes/*/HEAD' 2>/dev/null |
		awk 'NF == 2 { print $2; exit }')
	if [ -n "$remote_head" ]; then
		use_default_ref "$remote_head" "${remote_head##*/}" || true
	fi
	if [ -z "$default_ref" ]; then
		configured=$(git_ro -C "$repo" config --get init.defaultBranch 2>/dev/null || true)
		if [ -n "$configured" ]; then
			use_default_ref "refs/heads/$configured" "$configured" || true
		fi
	fi
fi

if [ -z "$default_ref" ]; then
	echo "warn: no default branch ref is available locally; merged state will be UNKNOWN" >&2
fi

current_worktree=$(git_ro -C "$repo" rev-parse --show-toplevel 2>/dev/null)
current_worktree=$(cd "$current_worktree" 2>/dev/null && pwd -P)

printf '# repository\t%s\n' "$repo"
printf '# default-branch\t%s\n' "${default_branch:-unresolved}"
printf '# default-ref\t%s\n' "${default_ref:-unresolved}"
printf 'SIZE_KB\tCURRENT\tBRANCH\tHEAD\tMERGED\tTRACKED\tUNTRACKED\tPR\tDECISION\tCHANGES\tWORKTREE\n'

git_ro -C "$repo" worktree list --porcelain |
while IFS= read -r field; do
	case "$field" in
		"worktree "*) worktree=${field#worktree } ;;
		*) continue ;;
	esac

	if [ -d "$worktree" ]; then
		canonical=$(cd "$worktree" 2>/dev/null && pwd -P)
	else
		canonical=$worktree
	fi
	size_kb=$(du -sk "$worktree" 2>/dev/null | awk '{print $1}')
	[ -n "$size_kb" ] || size_kb=0
	head=$(git_ro -C "$worktree" rev-parse --verify HEAD 2>/dev/null || echo unknown)
	branch=$(git_ro -C "$worktree" symbolic-ref --quiet --short HEAD 2>/dev/null || echo DETACHED)
	if [ "$canonical" = "$current_worktree" ]; then current=yes; else current=no; fi

	if [ -z "$default_ref" ] || [ "$head" = unknown ]; then
		merged=UNKNOWN
	elif git_ro -C "$worktree" merge-base --is-ancestor "$head" "$default_ref" 2>/dev/null; then
		merged=YES
	else
		merged=NO
	fi

	status_ok=yes
	if ! porcelain=$(git_ro -C "$worktree" status --porcelain=v1 --untracked-files=all 2>/dev/null); then
		status_ok=no
		porcelain=""
	fi
	tracked=$(printf '%s\n' "$porcelain" | awk 'length($0) && substr($0,1,2) != "??" { n++ } END { print n+0 }')
	untracked=$(printf '%s\n' "$porcelain" | awk 'substr($0,1,2) == "??" { n++ } END { print n+0 }')
	changes=$(printf '%s\n' "$porcelain" | awk 'length($0) { gsub(/\t/, " "); if (seen++) printf "; "; printf "%s", $0 } END { if (seen) print "" }')
	[ -n "$changes" ] || changes=-

	if [ "$current" = yes ]; then
		decision=hold-current
	elif [ "$status_ok" != yes ]; then
		decision=needs-user-decision
		changes=status-unavailable
	elif [ "$tracked" -gt 0 ] || [ "$untracked" -gt 0 ]; then
		decision=hold-uncommitted
	elif [ "$merged" = YES ]; then
		decision=candidate-needs-approval
	else
		decision=needs-user-decision
	fi

	printf -v quoted_worktree '%q' "$canonical"
	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
		"$size_kb" "$current" "$branch" "$head" "$merged" "$tracked" \
		"$untracked" "not-queried" "$decision" "$changes" "$quoted_worktree"
done |
	sort -t $'\t' -k1,1nr
