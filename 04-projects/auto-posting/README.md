---
title: Auto posting system
status: in-progress
created: 2026-10-20
---

# Auto posting system

An AI sends content to an n8n webhook. n8n stores it in a Google Sheet and posts it on schedule. The format of the content decides the platforms. Facebook is first; TikTok and YouTube Shorts come later.

n8n runs on the server at `http://ps.taildae6a9.ts.net:5678` (tailnet only). See [[05-knowledge/server-services]].

## Jobs

**Job 1 – Create post.** Webhook `POST /webhook/posts` with header auth. It checks that `format` exists in `Routes` and that the required fields are present. Then it appends one row to `Posts` with status `Ready` and returns `201 {id}`. A bad request returns `400` and writes nothing.

**Job 2 – Publish.** Runs every 5 minutes. One run does three things:

1. Expand: for each `Ready` post that is due, read the targets from `Routes` by `format` (or from `targets_override`). Set the post to `Processing`.
2. Deliver: for each target, upsert a `Deliveries` row as `Posting`, call the adapter from `Targets`, and save `Posted`, `Pending` (retry), or `Failed`.
3. Aggregate: a `Processing` post whose deliveries are all final becomes `Done`, `Partial`, or `Failed`.

Retries stop after 3 attempts. A delivery stuck in `Posting` for more than 30 minutes becomes `Failed`, with no automatic retry, so a post is never published twice.

**Adapters.** Each target is one sub-workflow with the same contract:

- Input: `delivery_id`, `post_id`, `target`, `format`, `title`, `content`, `media_url`
- Output: `{ delivery_id, ok: true, post_url }` or `{ delivery_id, ok: false, error, retryable }`

The adapter only calls the platform API. The dispatcher owns status, retries, and Sheet writes.

## Google Sheet

| Tab | Columns |
|---|---|
| `Posts` | id, created_at, format, title, content, media_url, scheduled_at, targets_override, status, updated_at, error |
| `Deliveries` | delivery_id, post_id, target, status, attempts, post_url, posted_at, updated_at, error |
| `Routes` | format, targets, required |
| `Targets` | target, workflow_id, enabled |

`scheduled_at` is ISO 8601. A value without an offset is read as `Asia/Ho_Chi_Minh`.

Starting `Routes`:

| format | targets | required |
|---|---|---|
| text | facebook_post | content |
| text_image | facebook_post | content, media_url |
| video_vertical | facebook_reel | media_url |

## Platforms

| Target | Format | Status | Notes |
|---|---|---|---|
| dryrun | any | built, not tested | Posts nothing; returns ok. For end-to-end tests. |
| facebook_post | text, text_image | live; text post tested 2026-10-20 | Graph API `/{page_id}/feed` or `/{page_id}/photos`. Needs a Page token with `pages_manage_posts`. |
| facebook_reel | video_vertical | built, not tested with a real token | Reels API: start, upload from `file_url`, finish. |
| tiktok | video_vertical | todo | Content Posting API. The app needs TikTok review; before review, posts are private only. |
| youtube_shorts | video_vertical | todo | YouTube Data API upload with OAuth. OAuth needs n8n on https (e.g. `tailscale serve --https`). `title` is required, 100 chars max. |
| zalo_video | video_vertical | todo | Zalo OA video content via Article API. Not the Zalo Video short feed; see below. |

### Zalo

Research is done and nothing is built. The handoff for the next agent is [[04-projects/auto-posting/zalo-integration]]: API steps, token refresh design, adapter design, and open questions. In short, no official API posts to the Zalo Video short feed, so the plan uses the official OA video content API.

To add a platform: copy an adapter, change the API call, create its credential in n8n, add a row to `Targets`, and add the target to the matching `Routes` rows.

## Workflows on n8n

Created 2026-10-20. On 2026-10-20 15:08 the credentials were attached and Job 1 and Job 2 were activated. On this n8n version an adapter must also be active, or Job 2 gets "Workflow is not active and cannot be executed". All three adapters were activated at 15:17. Activate every new adapter after the build script creates it.

Setup done on 2026-10-20:

- Sheet `Auto posting` (`11z24Z6JnQLKsYBg7tX26uk6bs7NqHcgVa1DgBxM69Vk`), owned by `doanphatvtp96@gmail.com`, shared as Editor with the service account.
- Google Cloud project `n8n-auto-post-512117` (owner `doanphatvtp96`), Sheets API and Drive API on, service account `n8n-sheets@n8n-auto-post-512117.iam.gserviceaccount.com`.
- Meta app `Auto Post n8n` (`1640309164404643`), developer account email `ongtrumtaichinh888@gmail.com`, use case "Manage everything on your Page" with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. App is in Development mode.
- Page `Điện Máy Toàn Phát`, Graph ID `107032218841145`, profile `profile.php?id=100086453767485`, 1,110 followers, owned by business `Điện Máy Toàn Phát` (`1912612219407293`). It is missing from `me/accounts` because access goes through the business; the token comes from `GET /107032218841145?fields=access_token`. A same-name Page `246080948579444` (39 followers) is not the target; a test post went there by mistake and was moved to trash on 2026-10-20 (auto-deleted after 30 days). Page token: type PAGE, never expires; data access expires about 2027-01-18, after which the token must be refreshed through Graph API Explorer.
- n8n credentials: `Google Service Account` (`LgZTIppDoeaAjJXF`), `Facebook - Dien May Toan Phat` (`tqYldlysWaw4WwmH`), `Posts API token` (`VbVVyKszxpQwqDiX`, header `X-API-Key`). The webhook token is also in the Windows user env var `POSTS_API_KEY` on admin-pc.
- The first Facebook token paste was wrong ("Cannot parse access token"). After re-pasting, the n8n test passed and a text post published to the correct Page at 16:10: https://www.facebook.com/107032218841145_1111317598426689 . Not yet checked whether people outside the app see posts while the app is in Development mode.

Planned: post to a second Page, `PHÁT LÀM ĐIỆN MÁY` (`1131673323362793`), with its own topics. Add a `page` column to `Posts`, one Facebook credential per Page, and pick the credential by `page` in the adapters. The current user token already covers that Page, so only its Page token is needed.

| Key | Workflow | ID |
|---|---|---|
| job1 | Job 1 – Create post (API) | `UDIR9hFMuZUpFbhe` |
| job2 | Job 2 – Publish (dispatcher) | `tFGAyPNNh7GjaYOE` |
| dryrun | Adapter – dryrun | `dTHj6xh0PxGcar9d` |
| facebook_post | Adapter – facebook_post | `yUGbx0WdK4TMcgAK` |
| facebook_reel | Adapter – facebook_reel | `3do6X5CcAWYDaw2I` |

The source of truth is `workflows/build.mjs`. It reads `workflows/config.json` (sheet ID, Page ID, Graph version, credential IDs) and creates or updates the workflows through the n8n API. Edit the script, not the n8n UI, or the next build overwrites the UI changes.

```bash
N8N_API_KEY=... node 04-projects/auto-posting/workflows/build.mjs
```

The Graph API version is `v23.0` in `config.json`. Meta retires each version about two years after release.

## Setup steps

1. **Google Sheet.** Create a sheet with four tabs named `Posts`, `Deliveries`, `Routes`, `Targets`. Paste each block below into cell A1 of its tab; the tabs split into columns.

   `Posts`:
   ```
   id	created_at	format	title	content	media_url	scheduled_at	targets_override	status	updated_at	error
   ```
   `Deliveries`:
   ```
   delivery_id	post_id	target	status	attempts	post_url	posted_at	updated_at	error
   ```
   `Routes`:
   ```
   format	targets	required
   text	facebook_post	content
   text_image	facebook_post	content, media_url
   video_vertical	facebook_reel	media_url
   ```
   `Targets`:
   ```
   target	workflow_id	enabled
   dryrun	dTHj6xh0PxGcar9d	TRUE
   facebook_post	yUGbx0WdK4TMcgAK	TRUE
   facebook_reel	3do6X5CcAWYDaw2I	TRUE
   ```
   Set the `Posts` and `Deliveries` columns to plain text (Format → Number → Plain text), so Sheets does not rewrite the timestamps.

2. **Google Service Account.** In Google Cloud: create a project, enable the Google Sheets API, create a service account, and download its JSON key. Share the sheet with the service account email as Editor. In n8n: Credentials → New → *Google Service Account API*, and paste the email and private key. OAuth2 does not work here, because Google rejects a plain-http redirect to `ps.taildae6a9.ts.net`.

3. **Facebook.** Get a long-lived Page access token with `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`. Step-by-step guide in Vietnamese: [[04-projects/auto-posting/huong-dan-tao-credential]]. In n8n: Credentials → New → *Facebook Graph API*. Note the Page ID.

4. **Webhook token.** In n8n: Credentials → New → *Header Auth*, name `X-API-Key`, value a long random string. The AI sends this header to Job 1.

5. Send the sheet ID, the Page ID, and the three credential names. The build script then attaches them, and the jobs can be activated.

## Calling Job 1

```bash
curl -X POST http://ps.taildae6a9.ts.net:5678/webhook/posts -H "X-API-Key: <token>" -H "Content-Type: application/json" -d '{"format":"text_image","content":"Hello","media_url":"https://example.com/a.jpg","scheduled_at":"2026-10-21T09:00:00+07:00"}'
```

Fields: `format` (required), `content`, `title`, `media_url`, `scheduled_at` (default now), `targets` (array, overrides `Routes`, e.g. `["dryrun"]` for a test).
