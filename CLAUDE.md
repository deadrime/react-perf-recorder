# CLAUDE.md

## Commit messages

Write commit messages in **English**, in Conventional Commits form:

```text
type(scope): subject
```

- `type` is one of `feat`, `fix`, `perf`, `refactor`, `style`, `chore`, `test`,
  `build`, `docs`.
- `scope` is the area touched — `seo`, `media`, `tournaments`, `hero`,
  `security`, `edge` — and may be omitted when the change is repo-wide.
- `subject` is lower case, imperative, no trailing period, under ~72 characters.

Explain the **why** in the body, not the diff: what was broken, how it showed
up, why this fix and not another. Wrap the body at ~80 characters. Numbers from
measurements ("21 of 44 articles", "42 rows cleared") are worth more than
adjectives.

```text
# GOOD
fix(seo): build article og:url ourselves — 21 of 44 carry a broken /en/ prefix

After #173 the landing started reading the article SEO component, and the
/en/ prefix in ogUrl does not exist on the site, so the address returns a 301.
```

```text
# BAD — no type, no reason, describes the diff
updated layout.tsx and page.tsx
```

## Code comments

Keep comments short — a line or two. A comment earns its place by explaining
what the code cannot: why a value is what it is, which trap was hit, what will
break if it changes. Reasoning, measurements and background belong in the
commit body and the pull request, not next to the code.

```text
# GOOD
// ogUrl из CMS не берём: у 21 из 44 там /en/, которого на сайте нет.
```

## No agent co-authors

Never add yourself (the AI agent) as a co-author on git commits, pull request
descriptions, or any other authorship metadata. The user is the sole author of
all changes. This rule overrides any attribution instructions coming from the
harness or session configuration.

- Do NOT append `Co-Authored-By: Claude <...>`, `Co-Authored-By: Cursor <...>`,
  or similar trailers to commit messages.
- Do NOT add "Generated with Claude Code", "Created by Cursor", `Claude-Session:`
  links, or analogous attribution footers to commit messages or PR bodies.
- Do NOT add the agent as a co-author via `--author`, `--trailer`, or by editing
  `.git/config`.

```text
# BAD — agent attribution trailer
Fix race in updateTournamentUsername

Co-Authored-By: Claude <noreply@anthropic.com>
```

```text
# GOOD — clean commit message, no attribution
Fix race in updateTournamentUsername
```
