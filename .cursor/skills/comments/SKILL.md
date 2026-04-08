---
name: comments
description: >-
  Triage a PR’s GitHub review comments: list them with gh, fix code, reply on
  each thread as you go, push all commits, then resolve threads via gh api
  graphql. Use when the user says /comments, wants to address PR feedback, or
  asks to reply to and resolve review comments with the GitHub CLI.
---

# /comments — PR review comments: fix, reply, push, resolve

Run when the user says `/comments`, `comments`, or asks to pull GitHub PR comments, implement fixes, **reply** on GitHub, **push** commits, and **resolve** threads—using **`gh`** (GitHub CLI) for GitHub operations.

## Preconditions

- **Repository context**: Run from a git clone with `origin` pointing at GitHub (or set `GH_REPO` / `gh repo set-default`).
- **PR scope**: Know the **PR number** (or use `gh pr status` / `gh pr list --head "$(git branch --show-current)"` to find the PR for the current branch).
- **Auth**: `gh auth status` must show a logged-in user with permission to comment and push.
- Do **not** resolve threads until **all** relevant commits are **pushed** (see ordering below).

## Ordering (required)

1. **List** unresolved review threads / comments.
2. **For each item** (one by one): implement the change, **commit** if appropriate, then **post a reply** on that review comment explaining what you did (or why you won’t change it). Use the GitHub CLI as in §Reply.
3. **Push** all local commits for this branch: `git push` (or `git push -u origin <branch>` if needed). **Do not** resolve review threads before this push completes successfully.
4. **Resolve** each addressed thread using GraphQL (§Resolve). Only after pushes are on the remote so reviewers see code + replies together; resolving is the last step per thread.

If a fix needs no code change, still reply, then resolve after push when applicable.

## 1. Resolve owner, repo, and PR number

```bash
# Owner/repo (from remote)
git remote get-url origin

# PR for current branch (when not given explicitly)
gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number'

# Or view open PR metadata
gh pr view <number> --json number,url,title,state
```

Export `OWNER`, `REPO`, and `PR_NUMBER` for the commands below (or use `gh api` paths with `repos/{owner}/{repo}/...`).

## 2. List review comments and threads

`gh pr view` does **not** expose `reviewThreads` in `--json`. Use the **REST** or **GraphQL** API via `gh api`.

### Option A — REST: all pull review comments (good for IDs and file/line)

```bash
gh api "repos/{owner}/{repo}/pulls/{pr_number}/comments" --paginate
```

Each object includes `id` (node id for replies differs from database id—see GitHub docs), `body`, `path`, `line`, `user.login`, `html_url`, and `in_reply_to_id` (null for root comments in a thread).

Prefer threading replies under the **root** comment of a thread when `in_reply_to_id` is null; for collapsed threads, reply to the latest comment in that thread if that matches how the UI groups them.

### Option B — GraphQL: threads with resolve IDs (best for §Resolve)

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $n: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $n) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              id
              databaseId
              body
              path
              line
              author { login }
            }
          }
        }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F n=PR_NUMBER
```

Use each thread’s `id` (GraphQL global ID) for `resolveReviewThread`. Skip threads that are already `isResolved: true` unless the user asks to reopen.

## 3. Reply to a review comment (REST)

Use the **reply** endpoint so the message appears in the review thread (not a generic issue comment).

```bash
# Reply on a specific pull request review comment (use the comment id from the list response)
gh api --method POST "repos/{owner}/{repo}/pulls/comments/{comment_id}/replies" \
  -f body="Done: <short note>. Addressed in commit / change …"
```

`comment_id` is the numeric **database** id from the REST list response (`id` field on each comment object).

**One-by-one**: after you implement the feedback for a given comment, post the reply before moving to the next item (unless the user prefers a single batch reply—default here is one reply per thread as you go).

General PR/issue comments (not file-linked) use:

```bash
gh pr comment <pr_number> --body "…"
```

Use those only for top-level discussion, not for inline review threads.

## 4. Push (after all fixes are committed)

```bash
git status
git push origin "$(git branch --show-current)"
```

Resolve **merge/rebase conflicts** locally before pushing. If the branch has no upstream:

```bash
git push -u origin "$(git branch --show-current)"
```

**Do not** run §Resolve until this succeeds and all commits you intend to ship are on `origin`.

## 5. Resolve review threads (GraphQL)

There is no `gh pr review-thread resolve` in core `gh` as of common versions; use **GraphQL**:

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}' -f threadId='THREAD_GRAPHQL_ID'
```

`THREAD_GRAPHQL_ID` comes from §2 Option B (`reviewThreads.nodes[].id`). Resolve only threads you have **addressed** and **replied** to.

To **unresolve** (reopen) a thread:

```bash
gh api graphql -f query='
mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}' -f threadId='THREAD_GRAPHQL_ID'
```

## 6. Failure handling

- If `gh api` returns **403/404**, check SSO authorization (`gh auth refresh`) and repo permissions.
- If **resolve** fails because the thread id is wrong, re-run the GraphQL query in §2 Option B and copy the thread `id` exactly (global ID, not database id).
- If pushes are rejected, pull/rebase as appropriate, fix conflicts, push again, **then** resolve.

## Reference

- Inline review replies: REST **Create a reply for a pull request review comment** (same `gh api` pattern as §3).
- Thread resolve: GraphQL **`resolveReviewThread`**.
- Prefer **`gh`** over raw `curl` so authentication matches the user’s `gh` login.
