---
title: Zalo integration handoff
status: research done, not built
updated: 2026-10-20
parent: "[[04-projects/auto-posting/README]]"
---

# Zalo integration handoff

The goal is a `zalo_video` target that posts 9:16 videos to a Zalo Official Account (OA). Research is done and nothing is built yet. This note gives the next agent what it needs to build the adapter and the token workflow.

Read [[04-projects/auto-posting/README]] first. It defines the jobs, the Sheet tabs, the adapter contract, and the build script. This note only covers what is specific to Zalo.

## Scope decision

The user asked for "Zalo short" (the Zalo Video short-video feed). No official API posts to that feed. Libraries that claim to do it log in as a personal Zalo account through reverse-engineered APIs. That can get the account locked, so it is out of scope.

The official API posts a **video content item to the OA's content page**. That is what this integration builds. Before you start, confirm with the user that an OA video post is acceptable, because it differs from the Zalo Video feed.

Posting does not notify followers. Notification needs a Broadcast message, which is a separate API with its own quota. Broadcast is not in scope.

## Prerequisites (the user must do these)

1. A Zalo Official Account. It needs a personal Zalo account and a Vietnamese (+84) phone number.
2. An app on [Zalo for Developers](https://developers.zalo.me), linked to the OA.
3. The OA admin grants the app the permission "Quyền quản lý bài viết" (manage articles).
4. A first access token and refresh token from **Zalo API Explorer**: Công cụ → API Explorer → choose the app → token type "OA Access Token" → choose the OA → Cho phép. This avoids a public OAuth callback URL, which n8n does not have (it is tailnet-only, plain http).
5. The app ID and the app secret key, needed for the refresh call.

Never ask the user to paste the secret key or tokens into chat. They enter them in n8n. See "Token storage" below.

## API reference

Every call goes to `https://openapi.zalo.me` and sends the header `access_token: <OA access token>`. TLS 1.2 or later is required. Zalo returns HTTP 200 with a JSON `error` field; `error: 0` means success. Do not treat HTTP 200 as success on its own.

### 1. Upload the video

`POST https://openapi.zalo.me/v2.0/article/upload_video/preparevideo`

- Body: `multipart/form-data`, field `file` = video binary.
- Limits: MP4 or AVI, 50 MB max.
- Response: `data.token`, an upload token for step 2.
- Upload is by file only, not by URL. The adapter must download `media_url` to binary first, and check the size before it uploads.

### 2. Wait for processing

`GET https://openapi.zalo.me/v2.0/article/upload_video/verify`

- Headers: `access_token`, and `token` = the upload token from step 1.
- Response `data`: `status`, `video_id`, `convert_percent`, `convert_error_code`, `status_message`.
- `status` values: `0` unknown, `1` ready, `2` locked, `3` processing, `4` failed, `5` deleted.
- Poll until `status = 1`. Stop with an error on `2`, `4`, or `5`. Stop with a retryable error after a timeout (suggest 10 s interval, 5 min max).

### 3. Create the video content

`POST https://openapi.zalo.me/v2.0/article/create`, JSON body:

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 150 chars max |
| `description` | yes | 300 chars max |
| `video_id` | yes | From step 2 |
| `avatar` | yes | Public URL of the thumbnail image |
| `status` | yes | `show` or `hide` |
| `comment` | no | `show` (default) or `hide` |

Response: `data.token`, a process token for step 4.

### 4. Get the content ID

`POST https://openapi.zalo.me/v2.0/article/verify`, JSON body `{ "token": "<process token>" }`.

Response: `data.id`, the content ID. The docs do not say whether this call can return before processing ends. Poll it a few times if `data.id` is missing.

### Not yet checked

- The public URL format of a posted OA video. Check "Lấy chi tiết nội dung dạng video" for a URL field, and use it as `post_url`. If none exists, store `zalo:<id>`.
- The Zalo error code list, to decide which errors are retryable. Until then, treat network errors and HTTP 5xx as retryable, and any non-zero `error` as not retryable.
- Rate limits for the content API.
- Whether `avatar` accepts any public URL, or only an image uploaded to Zalo first.

## Auth and token refresh

- Access token: valid 25 hours.
- Refresh token: valid 3 months, **single use**. Each refresh returns a new access token and a new refresh token. The old access token stops working at once.
- Refresh call: `POST https://oauth.zaloapp.com/v4/oa/access_token`, `application/x-www-form-urlencoded`, header `secret_key: <app secret>`, body `refresh_token`, `app_id`, `grant_type=refresh_token`.

Because a refresh token works only once, two workflows must never refresh at the same time. If they do, one loses and the chain breaks until a new token comes from API Explorer.

**Design:** one workflow, `Zalo – refresh token`, owns the token.

- Schedule trigger every 12 hours. This leaves a 13-hour margin before the 25-hour expiry.
- It reads the current refresh token, calls the refresh API, and saves both new tokens with `updated_at`.
- On failure, it raises an error loudly (an error workflow or a notification), because a broken chain stops all Zalo posts.
- The adapter only reads the access token. It never refreshes.

### Token storage

Pick one option and record the choice in this note:

1. **n8n Data Table** `zalo_tokens` (one row: `access_token`, `refresh_token`, `updated_at`). Simple, and both workflows can read and write it. The tokens are visible to anyone with n8n access. Check that this n8n version has Data Tables (n8n-mcp has `n8n_manage_datatable`).
2. **n8n credential updated through the API.** Safer, but first check whether the n8n public API allows updating a credential's data on this version.

Do not store tokens in the Google Sheet, in Git, or in this vault.

The app secret key goes in an n8n credential (Header Auth with name `secret_key`) that only the refresh workflow uses.

## Adapter design: `Adapter – zalo_video`

Build it in `workflows/build.mjs` like the other adapters, then add it to the `builders` map. It follows the same contract: input `delivery_id`, `title`, `content`, `media_url`, `thumbnail_url`; output `{ delivery_id, ok, post_url }` or `{ delivery_id, ok: false, error, retryable }`.

Suggested nodes:

1. `Start` (Execute Workflow Trigger, passthrough).
2. `Get token`: read the access token from the token store.
3. `Check input`: fail without retry if `title`, `media_url`, or `thumbnail_url` is empty. Cut `title` to 150 chars and `content` to 300 chars for `description`.
4. `Download video`: HTTP GET `media_url`, response format file. Fail without retry if the file is over 50 MB or is not MP4 or AVI.
5. `Upload video`: HTTP POST `preparevideo`, form-data, binary field `file`.
6. Poll loop: `Wait` 10 s, then `Verify upload`, then an IF on `status`. Loop on `3`, continue on `1`, fail on anything else. Count attempts in a Code node, and stop at 30.
7. `Create content`: HTTP POST `article/create`.
8. `Verify content`: HTTP POST `article/verify`. Poll briefly if `data.id` is missing.
9. `Result`: map the outcome to the contract. Check `error` in every Zalo response, not only the HTTP status.

Use `fullResponse: true` and `neverError: true` on the HTTP nodes, as the Facebook adapters do, so the Result node sees every failure.

A run can take several minutes while Zalo converts the video. Job 2 waits for adapters (`waitForSubWorkflow: true`), so a slow Zalo upload delays the rest of that run. If this becomes a problem, make the adapter return early with a `Pending` state and resume on the next run. That is not needed for a first version.

## Changes to the rest of the system

- **Sheet `Posts`:** add a `thumbnail_url` column. Job 1 must accept and store it.
- **Required fields per target.** Zalo needs `title` and `thumbnail_url`, but `facebook_reel` does not. `Routes.required` is per format, so it cannot express this. Suggested fix: add a `required` column to `Targets`, and have Job 1 check the union of `Routes.required` and the `Targets.required` of every target in the route. Discuss this with the user before you change Job 1.
- **Targets row:** `zalo_video  <workflow id>  TRUE`.
- **Routes row:** add `zalo_video` to `video_vertical`, so it reads `facebook_reel, zalo_video`.
- **README:** set the `zalo_video` row in the Platforms table to built or tested.

## Verification

1. Run `Zalo – refresh token` once by hand. Check that the token store has a new `updated_at`, and that a call to an OA read API works with the new token.
2. Run the adapter by hand with a small MP4 under 10 MB and a public thumbnail URL. Check that the video appears on the OA content page in OA Manager, and take a screenshot.
3. Send a `video_vertical` post through Job 1 with `targets: ["zalo_video"]`. Check the `Deliveries` row: `Posted` with a `post_url`.
4. Test the failure paths: a file over 50 MB (expect `Failed`, not retried), and an expired token (expect a clear error).

## Sources

- [Tải video lên cho nội dung bài viết](https://developers.zalo.me/docs/official-account/noi-dung/noi-dung-dang-bai-viet/tai-video-len-cho-noi-dung-bai-viet)
- [Nội dung dạng Video](https://developers.zalo.me/docs/official-account/noi-dung/noi-dung-dang-video/)
- [Kiểm tra kết quả tiến trình tạo nội dung](https://developers.zalo.me/docs/official-account/noi-dung/noi-dung-dang-bai-viet/kiem-tra-ket-qua-tien-trinh-tao-noi-dung)
- [Xác thực và ủy quyền cho Ứng dụng](https://developers.zalo.me/docs/official-account/bat-dau/xac-thuc-va-uy-quyen-cho-ung-dung-new)
- [Giới thiệu Official Account API và các nhóm Quyền](https://developers.zalo.me/docs/official-account/bat-dau/gioi-thieu-official-account-api-va-cac-nhom-quyen)
- [Tổng quan Nội dung](https://developers.zalo.me/docs/official-account/noi-dung/tong-quan)

The docs pages render inside an iframe. A plain fetch returns an empty page. To read one, open `https://stc-developers.zdn.vn/docs/v2/official-account/<path>?lang=vi&ts=1` in a browser and read the `article` element.
