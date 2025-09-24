# EmailXP Backend

## Environment Variables

Set these in a `.env` file at `backend/.env` (or your deployment environment):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | API key for Resend email provider. |
| `FRONTEND_URL` | Yes | - | Base URL for building confirmation/unsubscribe links. |
| `BACKEND_URL` | No | `http://localhost:5000` | Used in scheduled tasks/unsubscribe fallbacks. |
| `ALLOW_UNVERIFIED_SENDING` | No | `false` | If `true`, bypasses verified domain enforcement (DEV ONLY). |
| `DOUBLE_OPT_IN_TOKEN_TTL_HOURS` | No | `48` | Hours before a pending confirmation token expires. |
| `REDIS_HOST` | No | - | Enables Bull queue if provided (with optional `REDIS_PORT`, `REDIS_PASSWORD`). |
| `NODE_ENV` | No | `development` | Environment mode toggling logging/noise. |
| `REDIS_PORT` | No | `6379` | Redis port. |
| `REDIS_PASSWORD` | No | - | Redis auth password if required. |
| `REDIS_DB` | No | `0` | Redis logical DB index. |
| `REDIS_MAX_RETRIES_PER_REQUEST` | No | `5` | ioredis max retries per command before erroring. |
| `REDIS_CONNECT_TIMEOUT_MS` | No | `10000` | Connection timeout for Redis in ms. |
| `REDIS_RETRY_BASE_DELAY_MS` | No | `200` | Base delay for exponential reconnect. |
| `REDIS_RETRY_MAX_DELAY_MS` | No | `5000` | Max reconnect delay. |
| `QUEUE_RATE_MAX` | No | `100` | Max jobs per rate window. |
| `QUEUE_RATE_DURATION_MS` | No | `60000` | Rate limit window duration ms. |
| `QUEUE_BACKOFF_BASE_MS` | No | `2000` | Base backoff for exponential job retry strategy. |
| `QUEUE_BACKOFF_MAX_MS` | No | `60000` | Max backoff delay for retries. |
| `REDIS_TLS_ENABLED` | No | `false` | Set to `true` to enable TLS (Redis Cloud/Upstash). |
| `QUEUE_PREFIX` | No | - | Optional namespace prefix for Bull keys (multi-env sharing). |

## Double Opt-In Flow
1. Create subscriber with `doubleOptIn: true` in request body.
2. Subscriber stored with `status: pending`, `confirmationToken`, `confirmationExpiresAt`.
3. Confirmation email includes link: `${FRONTEND_URL}/confirm?token=...` hitting `GET /api/subscribers/confirm/:token`.
4. On confirmation: token expiry validated, status -> `subscribed`, `ConsentRecord` written with IP and user-agent.
5. Resend token via `POST /api/subscribers/:id/resend-confirmation` before expiry.

Expired tokens: client should prompt re-subscribe; backend currently returns 400 on expired token.

## Domain Enforcement
All outbound operations that place email on the wire (campaign send, test send, automation dispatch) still require a fully `verified` domain unless `ALLOW_UNVERIFIED_SENDING=true`.

Updated Policy (2025-09):
- Domain verification is NO LONGER part of the core onboarding gate. Users can explore the app, build campaigns, create segments, design templates, and configure automations without a verified sending domain.
- Actions requiring a verified domain now include:
	- Sending (campaign send / test send / automation email steps)
	- Publishing landing pages (enforced at publish transition)
	- Any future feature that generates public tracking hostnames or branded links
- If a domain regresses (DNS records lost), sending & publishing block again but general UI remains accessible.

Behavior Details:
- Attempting a blocked action returns HTTP 400 (or 400-level) with `code: DOMAIN_NOT_VERIFIED`.
- Auto‑retry: campaigns blocked solely for domain status are marked with `domainRetry.pendingAutoRetry=true` and retried automatically once the cron re‑verification marks a primary domain as verified.
- `hasVerifiedDomain` user flag is now informational only (not part of onboarding completion) and may flip false if all domains regress.

Developer Notes:
- Override for local development: set `ALLOW_UNVERIFIED_SENDING=true` in `.env` (never in production).
- To add a new gated feature, standardize responses using `code: DOMAIN_NOT_VERIFIED` for consistency.

Suggested UI Hooks:
- Send dialogs: surface inline warning + link to Domains page if `hasVerifiedDomain=false`.
- Landing page editor: disable Publish button with tooltip until domain is verified.

## Suppression & Safety Layers
- Unified suppression before queueing bulk sends.
- Excludes `pending` subscribers at query, scheduler, and queue processing layers.
- Idempotency guard via `EmailLog.idempotencyKey` prevents duplicate sends.

## Future Tasks (Suggested)
- Expired pending cleanup cron.
- Segment query engine (replace placeholders).
- Preference center & topic-based unsubscribes.
- DMARC advisory endpoint.

## Quick Start
```
cd backend
npm install
cp .env.example .env  # create file then edit values
npm start
```

## Minimal .env Example
```
RESEND_API_KEY=your_resend_key_here
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000
DOUBLE_OPT_IN_TOKEN_TTL_HOURS=48

## Segmentation

Segments define dynamic subscriber audiences via an array of filters. Each filter has:

### Verification Email Template
The verification email sent via `POST /api/users/send-verification-email` now uses a branded HTML template located at `utils/emailTemplates/verificationEmail.js`.

Key characteristics:
- Text logo styling: `Email` + `XP` with primary accent `#dc2626` (Tailwind red-600).
- Responsive table layout with graceful dark mode adjustments (`prefers-color-scheme: dark`).
- Accessible button (large tappable area, sufficient contrast, hover state).
- Plain‑text alternative automatically provided for clients that block HTML.
- Expiration notice and raw fallback URL are included for reliability.

Customization points:
- Change primary color: adjust `primaryColor` inside the builder.
- Add a hosted logo image: insert an `<img>` tag in the header section before/after the text logo.
- Update copy: modify paragraphs within the `buildVerificationEmail` function.

### Resend Limits
To prevent abuse / accidental rapid resends:
- Rate limiter: max 5 verification email requests per IP per 15 minutes (HTTP 429 beyond this).
- Per-user cooldown: additional enforced 60s server-side cooldown aligned with frontend UI timer.
- Frontend also stores a `verifyEmailCooldown` timestamp in `localStorage` to avoid unnecessary calls.

If you need to adjust limits:
- Edit `verificationEmailLimiter` in `routes/userRoutes.js` for window and max.
- Edit `verificationCooldowns` logic for the per-user cooldown duration.

### Troubleshooting
- Receiving 429: Wait until the `Retry in Xs` button resets or server cooldown expires.
- Sandbox / domain not verified (provider): API may respond with `409` and `sandbox: true` if provider denies external sends.

```
{
	field: string,          // e.g. "email", "status", "tags", "createdAt"
	operator: string,       // one of the supported operators below
	value: any,             // single value for most operators
	values?: any[],         // array for in/not_in
	from?: any, to?: any    // for between
}
```

Supported operators (normalized internally):
- equals: field == value
- not_equals: field != value
- contains: case-insensitive substring match (string fields)
- not_contains: inverse of contains
- starts_with / ends_with: case-insensitive prefix/suffix
- is_empty / is_not_empty: null/empty string checks
- greater_than / less_than: numeric or date comparison
- between: inclusive range using `from` and `to`
- in / not_in: membership against `values` array
- before / after: date comparison (value treated as date)
- within_days: documents with date field >= now - value days
- more_than_days_ago: date field < now - value days

Special field mappings:
- subscriptionStatus => maps to underlying `status` field (e.g. subscribed, pending, unsubscribed, bounced, complaint)
- tags: `in` becomes `$in` match; `not_in` becomes `$nin`
- Engagement fields: `openCount`, `clickCount`, `lastOpenAt`, `lastClickAt` support numeric/date operators above.

Previewing segments:
- Ad-hoc preview: `POST /api/segments/preview` with a filters array in body.
- Saved segment preview: `GET /api/segments/:id/preview?sample=25` returns `{ count, sample, query }`.

Security notes:
- All segment queries are automatically scoped to the authenticated user via their `user` id.
- Preview endpoints do not mutate stored segment stats.

## List Hygiene & Cleanup

Daily cron (02:15 server time) soft-deletes stale pending subscribers who never confirmed before `confirmationExpiresAt`.

Rationale:
- Prevents accumulation of unconfirmed addresses that hurt engagement metrics.
- Keeps unique email constraint performant.
- Supports accurate subscriber stats.

Details:
- Index `{ status:1, confirmationExpiresAt:1 }` accelerates scan.
- Cleanup uses `Subscriber.cleanupExpiredPending()` which soft-deletes (sets `isDeleted=true`, retains data for audit) instead of hard removal.
- Removal is capped in batches (`limit` default 1000) to avoid long-running operations; can be extended to loop if needed later.

## Index Audit

Set `INDEX_AUDIT=1` in environment before starting the server to log all collection indexes and warn about duplicate key patterns. Useful after adding/removing indexes.

Example (bash):
```
INDEX_AUDIT=1 node server.js
```

Output includes:
- collection: name
- indexes: raw index definitions
- warnings for duplicate patterns to consider dropping via Mongo shell (e.g. `db.collection.dropIndex('index_name')`).

## Preference Center

Allows subscribers to selectively unsubscribe from categories instead of global list removal.

Models:
- `PreferenceCategory` (user, name, key, description, isDefault, isArchived)
- `Subscriber.unsubscribedCategories` stores category ObjectIds opted-out.

Campaigns:
- `Campaign.preferenceCategory` associates a campaign with a category; if absent, default category (if defined) is assumed on create.
- Send pipeline excludes subscribers whose `unsubscribedCategories` includes the campaign category.

Routes:
- Auth CRUD: `GET/POST/PUT/DELETE /api/preference-categories`.
- Public preference view/update: `GET /api/preferences/:unsubscribeToken` and `POST /api/preferences/:unsubscribeToken` (body `{ categories: [ids...] }`).

Behavior:
- Setting `isDefault=true` on a category clears previous defaults.
- Archive instead of delete preserves historical attribution.
- Public updates overwrite unsubscribed set (client should send full desired list).

Future Enhancements (not yet implemented):
- Global unsubscribe override.
- Per-category engagement stats.
- Category-level suppression export.

## Deliverability & Engagement Endpoints

Base path: `/api/deliverability` (auth required)

Endpoints:

Notes:

### Advanced Insights

## Bounce & Complaint Handling

Verified domains receive a generated `bounceToken` enabling token-based correlation of provider bounce/complaint events back to the owning user/domain.

Sending Pipeline:
- `DomainAuthentication.bounceToken` set on create (backfilled via `scripts/backfillBounceTokens.js`).
- Campaign send loads primary verified domain auth; attaches `{ bounceToken, returnPath }` into `emailData.bounce` and persists to `EmailLog.metadata`.
- Future enhancement: set real SMTP envelope sender (`Return-Path`) to `b+<token>@${BOUNCE_BASE_DOMAIN}` (default `bounces.emailxp.com`).

Webhook Ingestion (`POST /api/webhooks/deliverability`):
- Attempts to parse `bounceToken` from `returnPath` pattern `b+token@...`.
- Fallback to header `X-Bounce-Token` if provided.
- Passes through to bounce/complaint service (currently token is captured for future domain-level analytics).

Backfill Commands:
```
node scripts/backfillBounceTokens.js          # Populate missing bounce tokens
```

Environment:
- `BOUNCE_BASE_DOMAIN` (optional) sets base for constructed return path.

Planned Next Steps:
- Map bounceToken to domain for per-domain reputation scoring.
- Provider-specific envelope/metadata injection once moving beyond Resend sandbox patterns.
`GET /api/deliverability/insights?days=30`

Provides deeper analytics for the specified rolling window (default 30 days):

Response shape:
```
{
	"timeWindow": { "start": "2025-09-01T00:00:00.000Z", "end": "2025-09-21T12:34:56.789Z" },
	"funnel": {
		"attempted": 12000,
		"delivered": 11500,
		"opened": 4800,
		"clicked": 900,
		"deliveryRate": 95.83,
		"openRateFromDelivered": 41.73,
		"clickRateFromDelivered": 7.82,
		"clickRateFromOpened": 18.75,
		"deliveredDropPct": 4.17,
		"openDropPct": 58.27
	},
	"bounceReasons": [ { "reason": "mailbox_full", "count": 120, "percent": 40 }, { "reason": "other", "count": 180, "percent": 60 } ],
	"complaintReasons": [ { "reason": "abuse", "count": 4, "percent": 66.67 }, { "reason": "other", "count": 2, "percent": 33.33 } ],
	"latency": {
		"open": { "p50": 32000, "p75": 90000, "p90": 300000, "p95": 720000, "p99": 3600000 },
		"click": { "p50": 120000, "p75": 300000, "p90": 900000, "p95": 1800000, "p99": 5400000 }
	},
	"responsiveness": [
		{ "bucket": "lt1m", "count": 900, "percent": 7.82 },
		{ "bucket": "1to5m", "count": 700, "percent": 6.09 },
		{ "bucket": "5to30m", "count": 1100, "percent": 9.56 },
		{ "bucket": "30mto2h", "count": 1400, "percent": 12.17 },
		{ "bucket": "gt2h", "count": 700, "percent": 6.09 },
		{ "bucket": "neverOpened", "count": 6700, "percent": 58.27 }
	]
}
```

Field notes:
- `funnel.attempted` = queued + sent (pre-success states)
- Percent fields are pre-rounded to 2 decimals client-side recommended (raw may have more precision).
- Latencies are in milliseconds (client can format into human-readable durations).
- Top 5 bounce/complaint reasons shown; remaining grouped under `other`.
- Responsiveness denominator is delivered emails (neverOpened = delivered - opened).

Usage example (assuming JWT auth header):
```
curl -H "Authorization: Bearer <TOKEN>" "https://your-host/api/deliverability/insights?days=30"
```

Potential future enhancements (not yet implemented):
- Cached percentile computations
- Reason taxonomy normalization
- Engagement cohort comparisons
ALLOW_UNVERIFIED_SENDING=false

## Queue & Processing Health

EmailXP uses a Redis-backed Bull queue when Redis is reachable; otherwise it falls back to an in-memory simple queue.

Detection & Fallback:
- On startup, if Redis connection fails (authentication, network, DNS) the wrapper logs and switches to simple mode.
- Subsequent job submission failures also trigger a per-call fallback with error capture.

Configuration Environment Variables (see table above):
- Rate limiting: `QUEUE_RATE_MAX` / `QUEUE_RATE_DURATION_MS`.
- Retry/backoff: `QUEUE_BACKOFF_BASE_MS`, `QUEUE_BACKOFF_MAX_MS`.
- Redis resilience: `REDIS_MAX_RETRIES_PER_REQUEST`, reconnect delays.

Health Endpoint:
```
GET /api/health/queue
{
	"queue": {
		"mode": "redis" | "simple",
		"lastError": "..." | null,
		"initializedAt": "2025-09-20T...Z",
		"stats": { waiting, active, completed, failed, delayed? },
		"uptimeSeconds": 123.45,
		"timestamp": "2025-09-20T...Z"
	}
}
```

Operational Notes:
- Simple queue is non-persistent; restart loses in-flight waiting jobs.
- Prefer Redis in production for durability & concurrency control.
- Use `INDEX_AUDIT=1` occasionally to ensure queue-related collections (Bull uses several) have expected indexes.

Failure Testing:
1. Start with Redis running — verify `mode: redis`.
2. Stop Redis — submit a new campaign send — watch fallback to `mode: simple`.
3. Restart Redis — (current implementation does not auto-promote; restart server to re-enable Redis mode).

Future Enhancements (not yet implemented):
- Auto-promote back to Redis when connection becomes healthy.
- Dead letter queue for permanently failed jobs.
- Prometheus metrics export.

### Bull Redis Constraints & Fallback Notes

Bull v3 creates three Redis connections (client, subscriber, bclient). Certain ioredis options (`maxRetriesPerRequest`, `enableReadyCheck`) cannot be applied to the subscriber or bclient connections. If you set (or Bull infers) disallowed options, you will see an error like:

```
Using a redis instance with enableReadyCheck or maxRetriesPerRequest for bclient/subscriber is not permitted.
```

Key points:
- Keep queue initialization minimal: only `redis` host/port/password/db.
- Custom `createClient` logic should avoid specifying `maxRetriesPerRequest`.
- A runtime message `Reached the max retries per request limit (which is 3)` indicates connectivity/auth issues—not necessarily the forbidden option error—triggering fallback to the simple in-memory queue.

Fallback Behavior:
- On initialization failure or subsequent command errors, wrapper sets `mode: simple` and retains the last error (visible at `GET /api/health/queue`).
- Jobs added while in simple mode are not persisted; restart after Redis recovery will not replay them.

Connectivity Debug Checklist:
1. Verify Redis reachable: `redis-cli -h <host> -p <port> PING` (should return `PONG`).
2. If using a cloud provider (Upstash, Redis Cloud) ensure correct TLS/non-TLS URL and password.
3. Confirm no local firewall/security software blocks the port.
4. For Docker-based Redis, check container logs and that port is published to the host.
5. If you see authentication errors, rotate or re-copy the password env variable.

Safe Enhancements:
- Implement a lightweight periodic probe that, when Redis becomes reachable again, logs readiness so you can manually restart to re-enable Redis mode (auto-promotion future task).

If persistence is critical before auto-promotion arrives, consider upgrading to BullMQ (which uses a slightly different connection handling model) and adding a Redis availability watcher.

## Secret Management & Rotation

Sensitive credentials (API keys, passwords, tokens) must never be committed. Practices implemented:

- `.env` is in `.gitignore`.
- A sanitized `.env.example` is provided for onboarding.
- `scripts/secretScan.js` detects common secret patterns.

### Running Secret Scan
```
node scripts/secretScan.js
```
Exit code `0` = no findings, `1` = potential exposures.

### Recommended Rotation Cadence
- High-risk API keys (email providers, payment gateways): 90 days.
- Infrastructure credentials (Redis password, Mongo user): 180 days or on role change.
- JWT secret: rotate if leaked or at least annually; support dual-secret rollover if implementing refresh tokens.

### Rotation Steps (Example: Redis Cloud)
1. Create new password / ACL user in provider console.
2. Update `.env` and redeploy.
3. Verify queue health endpoint returns `mode: redis`.
4. Revoke old credential.

### If a Secret Was Exposed
1. Revoke immediately in provider portal.
2. Replace in `.env` and restart service.
3. Invalidate dependent tokens/sessions if relevant (e.g., JWT secret leak).
4. Run `node scripts/secretScan.js` to ensure no lingering copies.
5. Purge build logs or CI artifacts containing the secret.

### Adding New Secrets
1. Add placeholder to `.env.example`.
2. Reference via `process.env.MY_SECRET` only in server code.
3. Never log full secret values (log last 4 chars if needed for debugging).

### Future Enhancements
- Integrate a pre-commit hook to run the scanner.
- Add checksum-based drift detection for `.env.example`.
- Support multiple active JWT secrets for zero-downtime rotation.
```
