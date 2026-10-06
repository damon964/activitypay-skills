# ActivityPay Skills

Skills that teach AI coding tools how to integrate tour, activity, and outdoor recreation booking
software with the ActivityPay payment gateway. Once installed, the AI tool follows ActivityPay's
conventions for keys, hosted payment fields, idempotency, error handling, and card-on-file flags
when it writes integration code.

This repository mirrors the layout of [payroc/skills](https://github.com/payroc/skills). It lives at
`github.com/damon964/activitypay-skills`. The MCP server lives in a separate repository
([activitypay-mcp](https://github.com/damon964/activitypay-mcp)).

To move it later (for example to an `activitypay` GitHub organization), transfer or rename the repo,
then run `node scripts/set-repo.mjs <owner>/<name>` and commit. See "Moving the repository" below.

## Plugins

| Plugin | Skills |
|---|---|
| `checkout` | `booking-checkout`, `deposits-balance-due`, `phone-booking-payment-link` |
| `refunds` | `cancellation-refunds` |
| `vault` | `card-on-file` |
| `notifications` | `webhooks` |

## Install

Claude Code (plugin marketplace), in your terminal:

```bash
claude plugin marketplace add damon964/activitypay-skills
```

Then install the plugins you need, for example `claude plugin install checkout@activitypay-skills`.

Cursor, VS Code, Gemini CLI, and other tools that support Agent Skills:

```bash
npx skills add damon964/activitypay-skills
```

Pair the skills with the ActivityPay MCP server so the AI tool can also search docs, run sandbox
transactions, and check readiness:

```bash
claude mcp add --transport http activitypay https://mcp.activitypay.co/mcp --header "X-ActivityPay-Api-Key: api_yourSandboxKey"
```

## Layout

```
.claude-plugin/marketplace.json        Claude Code marketplace
.cursor-plugin/marketplace.json        Cursor marketplace
plugins/activitypay/<plugin>/
  plugin.json, .claude-plugin/plugin.json, .cursor-plugin/plugin.json
  skills/<skill>/SKILL.md
  skills/<skill>/references/           copied from _shared/references by the sync script
_shared/references/                    edit references here only
scripts/sync.mjs                       copies references and regenerates manifests
```

## Maintaining

1. Edit `SKILL.md` files or `_shared/references/*`.
2. Run `npm run sync` (or `node scripts/sync.mjs`; Node 20+, no dependencies). It copies references into every skill and regenerates all manifests.
3. When the gateway docs change, refresh `_shared/references/` from the sources listed in `_shared/references/_sources.md`, and keep them consistent with `spec/openapi.yaml` in the activitypay-mcp repository.
4. Bump `metadata.version` in any changed `SKILL.md` so installed copies can detect the update.

## Moving the repository

The repository address appears in the install commands above, each skill's version check, and the
plugin manifests. To change it:

1. Transfer or rename the repository on GitHub. GitHub redirects the old address to the new one, so
   existing installs keep working as long as nobody creates a new repository at the old address.
2. Run `node scripts/set-repo.mjs <owner>/<name>` (for example `your-org/skills`). It rewrites every
   occurrence and regenerates the manifests.
3. Commit, push, and bump `metadata.version` in each `SKILL.md` so installed copies pick up the new address.
