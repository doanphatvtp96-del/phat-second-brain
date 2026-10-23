---
title: Team vault workflow (Git, gbrain, dewee)
updated: 2026-10-23
status: planned, not deployed
---

# Team vault workflow

Ghi chép này mô tả cách vault được dùng chung giữa chủ vault (trên laptop) và nhân viên (qua nhóm Telegram), và kế hoạch triển khai trên server. Agent và người mới phải đọc ghi chép này trước khi chạy lệnh `git` trên vault, trước khi cài gbrain hoặc dewee, và trước khi viết skill tạo hay sửa file trong vault.

Hình dung vault là một cuốn sổ chung của công ty. GitHub giữ bản gốc của cuốn sổ. gbrain là người thủ thư duy nhất được viết vào bản sổ trên server, và thủ thư thuộc mục lục nên tìm rất nhanh. dewee là quầy lễ tân trong nhóm Telegram: nhân viên nhờ lễ tân, lễ tân chuyển yêu cầu cho thủ thư. Chủ vault sửa bản sao của mình trên laptop rồi gửi lên GitHub, và thủ thư lấy về để cập nhật mục lục.

## Trạng thái

- Chưa triển khai. Ngày 2026-10-23, vault chưa có bản clone nào trên server. Vault chỉ có trên laptop và trên GitHub (`git@github.com:doanphatvtp96-del/phat-second-brain.git`). [Source: tìm `COG-VERSION` trên server qua SSH | 2026-10-23 | confidence: high]
- Danh sách dịch vụ đang chạy, cổng, và quy ước mạng của server nằm trong [[05-knowledge/server-services]]. Sau khi cài gbrain hoặc dewee, cập nhật ghi chép đó.

## Quyết định đã chốt

- **Một repo, đưa cả vault lên server (phương án B).** Chủ vault chọn ngày 2026-10-23, nguyên văn: "B hiện tại chưa quan tâm đến vấn đề đó". Phương án A (tách repo riêng tư và repo team) đã được xem xét và không chọn.
- **Chưa giới hạn quyền đọc.** Nhân viên hỏi bot có thể tìm được mọi nội dung đã lập chỉ mục, kể cả `02-personal/`, `03-professional/`, `05-knowledge/people/` và `01-daily/journal/`. Đây là lựa chọn của chủ vault, không phải lỗi. Nếu sau này cần giới hạn, xem § Mở rộng sau.
- **gbrain là bên duy nhất ghi vào bản clone trên server.** Agent dewee không chạy `git` và không dùng file tool của dewee để sửa vault.

## Vai trò của từng thành phần

| Thành phần | Nơi chạy | Vai trò |
|---|---|---|
| GitHub repo | GitHub | Bản gốc của vault. Mọi thay đổi đi qua đây. |
| gbrain | Server | Giữ bản clone trên server, ghi file, commit, push, kéo commit mới về, và giữ chỉ mục tìm kiếm trong Postgres. Phục vụ MCP qua HTTP. |
| dewee | Server | Cổng chat Telegram. Xác thực nhân viên, chạy skill định dạng nội dung, gọi tool MCP của gbrain. Không giữ bản vault. |
| Claude Code | Laptop | Agent của chủ vault. Sửa file trực tiếp trên bản clone ở laptop, pull và push qua hook. |
| Obsidian | Laptop | Chủ vault sửa tay. Plugin Obsidian Git pull và push theo chu kỳ. |

```
 Laptop                              GitHub                         Server (ps)
 Obsidian + Claude Code  ──push──►   repo   ◄──push── gbrain (bên ghi duy nhất)
        ▲                │                 │──fetch─► │ Postgres + pgvector (chỉ mục)
        └──────pull──────┘                            │ MCP HTTP trên tailnet (OAuth)
                                                      ▲
                                  dewee ──── MCP ─────┘
                                    ▲
                        Nhóm Telegram nhân viên (@bot)
```

Vì sao không để vault trong workspace của dewee:

- Trong nhóm Telegram, mọi thành viên dùng chung một workspace với user ID `group:telegram:<chatID>`. [Source: `nextlevelbuilder/dewee` `cmd/gateway_consumer_normal.go:145-159`, branch `dev` | 2026-10-23 | confidence: high]
- dewee chuyển các file tên `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, `USER.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` ở mọi cấp thư mục trong workspace vào Postgres thay vì ổ đĩa. Vault có `AGENTS.md` ở thư mục gốc, nên dewee sẽ không đọc được file thật. [Source: dewee `internal/tools/context_file_interceptor.go:30-66` | 2026-10-23 | confidence: high]
- Nếu dewee tự chạy `git` song song với gbrain, khóa ghi của gbrain mất tác dụng.

## Quy tắc Git cho từng bên

| Bên | Push khi nào | Kéo về khi nào |
|---|---|---|
| gbrain (server) | Ngay sau mỗi lần ghi trang. Mỗi lần ghi là một commit, chỉ chứa file vừa ghi. | `gbrain sources refresh`, autopilot chạy khoảng 15 phút một lần. |
| Claude Code (laptop) | Hook `Stop`: commit các file agent vừa sửa, rồi push. | Hook `SessionStart`, và hook `PreToolUse` trước `Edit` hoặc `Write`. |
| Obsidian (laptop) | Plugin Obsidian Git, vài phút một lần. | Khi mở vault và theo chu kỳ. |
| dewee | Không bao giờ. | Không bao giờ. |

Chi tiết phía gbrain [Source: DeepWiki `garrytan/gbrain`, trang "Git Sync & Multi-Source Brains" | 2026-10-23 | confidence: medium]:

- Ở managed mode có bật git durability, gbrain commit đúng các đường dẫn nó ghi và push `HEAD` sau mỗi lần ghi.
- Nếu GitHub từ chối push vì có commit mới, gbrain gộp commit đó trong bộ nhớ rồi push kết quả. Bước gộp không chạm vào file khác.
- Nếu hai bên sửa cùng một file, gbrain giữ lần ghi đó với lỗi `integrate_conflict` và chờ người quyết định.
- `gbrain sources refresh` chạy `git fetch`, tạm dừng nhận lệnh ghi mới cho đến khi hàng đợi ghi xong, rồi chạy `git merge --ff-only` và `gbrain sync`. Nếu bản clone trên server có commit chưa lên GitHub, refresh dừng với lỗi `refresh_diverged`.
- gbrain push bằng một Personal Access Token lưu trong file. `gbrain sources harden` gắn token vào repo, cài cron refresh, và đặt `pull.ff=only`.

Quy tắc trên laptop:

- Pull bằng `git pull --no-rebase`. Commit chỉ các file đã sửa, không dùng `git add -A` hoặc `git commit -a` trong hook.
- Nếu push bị từ chối, pull rồi push lại một lần. Nếu vẫn lỗi hoặc có xung đột, dừng và báo chủ vault. Hook không tự sửa xung đột.
- Không chạy `git reset --hard`, `git commit --amend` hoặc `git push --force` (xem `CLAUDE.md` § Git).

Quy tắc trên bản clone ở server:

- Không người hay agent nào chạy `git pull --rebase`, `git stash`, `git add -A`, `git commit -a`, `git reset --hard` hoặc `git push --force` trong bản clone của gbrain. Mọi thay đổi đi qua tool của gbrain. [Source: DeepWiki `garrytan/gbrain`, quy tắc "multi-agent rules for a shared brain checkout" | 2026-10-23 | confidence: medium]

Độ trễ dự kiến: commit của gbrain có trên GitHub ngay, và laptop thấy nó ở lần pull kế tiếp. Commit từ laptop hiện cho nhân viên trong khoảng 15 phút, sau lần refresh kế tiếp. Webhook từ GitHub có thể rút ngắn thời gian này, nhưng GitHub không gọi được vào tailnet, nên chỉ làm khi độ trễ gây vướng.

## Quy tắc tạo và quản lý file

Ánh xạ trang và file [Source: DeepWiki `garrytan/gbrain`, trang "Knowledge Model" và "Operations Contract" | 2026-10-23 | confidence: medium]:

- Mỗi trang có một slug, và slug là đường dẫn file. Với nguồn `default`, slug `meetings/2026-10-23-khach-x` là file `meetings/2026-10-23-khach-x.md`. Nguồn khác được ghi vào `.sources/<source_id>/<slug>.md`. Vì vậy vault phải là nguồn `default`.
- Tên file là danh tính của trang. Người: `ho-ten.md` (chữ thường, gạch nối), như quy ước trong `05-knowledge/people/README.md`. Công ty: `ten-cong-ty.md`.
- Frontmatter YAML nằm trong nội dung trang. gbrain giữ trường `slug` và `id`. Khi đổi tên file, `gbrain sync` dùng `frontmatter.id` để nối file cũ với file mới.

Chọn lệnh theo việc cần làm:

| Việc | Nhân viên qua bot | Chủ vault trên laptop |
|---|---|---|
| Tạo trang mới | `put_page` hoặc `capture` | Tạo file trong Obsidian, push |
| Sửa trang có sẵn | `edit_page` | Sửa trực tiếp, push |
| Thêm thông tin vào cuối | `append_page` hoặc `add_timeline_entry` | Sửa trực tiếp |
| Đổi tên, chuyển thư mục | Không làm | `git mv`, commit, push |
| Xóa | Chỉ admin, `delete_page` (xóa mềm) | `git rm`, push |

- **Chỉ dùng `put_page` để tạo trang mới.** Lệnh này thay toàn bộ nội dung trang, nên dùng nó để sửa có thể xóa mất đoạn người khác vừa thêm.
- MCP của gbrain không có lệnh đổi tên. Đổi tên và sắp xếp lại thư mục chỉ làm trên laptop.
- Xóa vĩnh viễn (`purge`) chỉ chạy được từ CLI cục bộ trên server. Git vẫn giữ lịch sử để khôi phục.

Nơi đặt trang mới:

- Gốc vault có một tệp `RESOLVER.md`. Tệp này là cây quyết định: loại nội dung nào vào thư mục nào. Mỗi thư mục có một `README.md` mô tả nội dung của nó. Mỗi loại thông tin chỉ có một chỗ.
- `RESOLVER.md` chưa có. Nó phải dùng cấu trúc thư mục COG hiện tại (`00-inbox` đến `06-templates`), không dùng cấu trúc gợi ý của gbrain (`people/`, `companies/`, `meetings/`).

Chống trùng trang, chạy trước khi tạo trang mới:

1. Tìm trang theo tên, khớp chính xác và khớp gần đúng.
2. Tìm trong trường `aliases` của mọi trang.
3. Nếu tìm thấy, cập nhật trang cũ và thêm tên mới vào `aliases`.
4. Nếu không tìm thấy, tạo trang mới.

Mẫu và dấu vết người ghi:

- Mỗi loại trang có một mẫu trong `06-templates/`. Hiện có `people-profile-template.md`. Skill của dewee đọc mẫu rồi điền vào.
- Hồ sơ người dùng hai lớp: phần tóm tắt hiện tại ở trên, timeline chỉ thêm ở dưới. Cấu trúc này khớp với `add_timeline_entry` của gbrain.
- gbrain chỉ biết client là "dewee", không biết nhân viên nào gửi. Skill của dewee phải ghi tên người gửi Telegram vào frontmatter (`created_by`, `updated_by`) và vào commit message.
- Frontmatter bắt buộc cho trang mới: `id`, `type`, `aliases`, `created_by`, `updated_by`.

## Xung đột và cảnh báo

- Chia vùng ghi để hai bên ít khi sửa cùng file. Nhân viên chỉ ghi vào các thư mục được cấp. Bot ưu tiên `append_page` và `add_timeline_entry`.
- Khi gbrain báo `integrate_conflict`, bot báo cho người gửi: "Trang này vừa bị sửa ở chỗ khác, cần chủ vault xử lý." Chủ vault giải quyết trên laptop.
- Phải có cảnh báo (Telegram cho chủ vault, qua n8n hoặc cron của dewee) khi có `integrate_conflict` hoặc `refresh_diverged`. Nếu không, server âm thầm ngừng nhận nội dung mới từ laptop.

## Bảo mật tối thiểu

- Agent dewee không có tool `exec`. Nó chỉ có các tool MCP của gbrain. Lý do: tin nhắn của nhân viên có thể chứa lệnh giả (prompt injection).
- Token GitHub chỉ nằm ở gbrain. Dùng fine-grained PAT chỉ cấp quyền vào repo vault, quyền `Contents: read and write`. Lưu file với mode `600` trong `/root/service-secrets/` hoặc trong home của user chạy gbrain.
- gbrain và dewee bind `127.0.0.1`, mở qua `tailscale serve` theo quy ước trong [[05-knowledge/server-services]]. Không publish cổng ra `0.0.0.0`.
- Nhóm Telegram dùng chính sách `allowlist`. Bot chỉ trả lời khi được @mention (mặc định của dewee).
- `.env` của vault nằm trong `.gitignore`, nên không lên server qua Git. Giữ nguyên như vậy.

## Kế hoạch triển khai

Tài nguyên server ngày 2026-10-23: 4 CPU, 7.8 GB RAM (khoảng 6 GB còn trống), 103 GB đĩa trống, Git 2.43.7. Chưa có Bun, Node hay `psql` trên host. [Source: SSH vào server | 2026-10-23 | confidence: high]

### Điều kiện trước khi bắt đầu

- [ ] **License dewee cho kênh chat.** Bản self-install chính thức của dewee khóa kênh chat (Telegram) cho đến khi workspace có license. Agent và chat trên dashboard vẫn chạy không cần license. Giá công bố: 500 USD mỗi năm cho mỗi workspace (ưu đãi 250 USD năm đầu cho 50 suất). [Source: dewee `internal/config/license_gate.go:12-40` và https://dewee.sh | 2026-10-23 | confidence: high]. Mã nguồn dewee dùng giấy phép CC BY-NC 4.0, không cho dùng thương mại, nên không tự build bản bỏ khóa để dùng cho công ty.
- [ ] API key cho embedding và LLM của gbrain. gbrain hỗ trợ Voyage (mặc định), OpenAI, OpenRouter, Azure OpenAI, Ollama. Tính năng tổng hợp dùng `ANTHROPIC_API_KEY` hoặc `OPENAI_API_KEY`.
- [ ] API key cho LLM của dewee.
- [ ] Fine-grained PAT cho repo vault.
- [ ] Bot Telegram mới (qua @BotFather) và nhóm Telegram của nhân viên.

### Bước 1: Cài gbrain trên server

- Tạo user hệ thống riêng cho gbrain (không phải root, không trong nhóm `docker`), theo cách của user `agent`.
- Chạy Postgres có pgvector bằng Docker Compose trong `/opt/services/gbrain`, image `pgvector/pgvector:pg17`, bind `127.0.0.1`. Không dùng chung Postgres của Multica.
- Cài Bun 1.4.0 trở lên và gbrain: `bun install -g github:garrytan/gbrain`. Không cài gói `gbrain` từ npm, vì đó là dự án khác.
- `gbrain init --prefer-postgres` với `GBRAIN_DATABASE_URL`.
- Clone vault vào home của user gbrain. Kết nối bản clone làm nguồn `default` ở managed mode, bật git durability, chạy `gbrain sources harden` với file PAT.
- `gbrain autopilot --install`. Đặt API key trong `~/.gbrain/env` (mode `600`).
- `gbrain serve --http --port 3131 --bind 127.0.0.1 --public-url <tailnet https URL>`, chạy bằng systemd. Mở qua `tailscale serve --https=<cổng>` để có URL HTTPS cho OAuth.
- Tạo client OAuth cho dewee với scope `read,write` và giới hạn thư mục ghi (`--bound-slug-prefixes`). Tạo client riêng cho Claude Code trên laptop.
- Nghiệm thu: từ Claude Code trên laptop, gọi `search` và `get_page` qua MCP và nhận đúng trang. Gọi `put_page` tạo một trang thử, thấy commit mới trên GitHub, rồi xóa trang thử. Push một thay đổi từ laptop và thấy nó trong `search` sau lần refresh kế tiếp.

### Bước 2: Viết bộ quy tắc trong vault

- `RESOLVER.md` ở gốc vault và `README.md` cho từng thư mục chính.
- Quy ước frontmatter bắt buộc, và cập nhật các mẫu trong `06-templates/` cho có các trường đó.
- Một skill "lưu vào vault" dùng chung cho dewee và Claude Code: chọn thư mục theo `RESOLVER.md`, chống trùng, điền mẫu, chọn đúng lệnh, ghi `created_by` và `updated_by`.
- Nghiệm thu: một agent mới, chỉ đọc các tệp trên, đặt được ba ví dụ (biên bản họp, hồ sơ người, ghi chú dự án) vào đúng thư mục.

### Bước 3: Cài hook pull và push trên laptop

- Tạo `.claude/settings.json` trong vault với hook `SessionStart`, `PreToolUse` (cho `Edit` và `Write`) và `Stop`, theo § Quy tắc Git cho từng bên. Script đặt trong `.claude/lib/`.
- Cài plugin Obsidian Git: pull khi mở vault, tự commit và push vài phút một lần.
- Nghiệm thu: mở phiên mới thì thấy commit gbrain vừa tạo. Sửa một file thì thấy commit chỉ chứa file đó trên GitHub. Tạo xung đột giả thì hook dừng và báo, không tự sửa.

### Bước 4: Cài dewee trên server

- Clone `nextlevelbuilder/dewee` vào `/opt/services/dewee`. Chạy bằng Docker Compose với Postgres của dewee. Bind `127.0.0.1:18790`, mở dashboard qua `tailscale serve`. Telegram dùng long polling nên không cần mở cổng.
- Kích hoạt license kênh chat cho workspace.
- Tạo một agent, tắt `exec` và file tool, đăng ký MCP server gbrain qua `streamable-http`. Chép các quy tắc của vault (nội dung `AGENTS.md` và các phần liên quan trong ghi chép này) vào context của agent.
- Cài skill "lưu vào vault" từ bước 2.
- Thêm kênh Telegram, đặt nhóm vào allowlist, giữ chế độ chỉ trả lời khi được @mention.
- Cài cảnh báo `integrate_conflict` và `refresh_diverged` gửi về Telegram của chủ vault.
- Nghiệm thu: trong nhóm, "@bot tìm X" trả lời kèm trang trích dẫn. "@bot lưu biên bản này" tạo đúng file ở đúng thư mục, có `created_by`, và có commit trên GitHub. Laptop pull về và thấy file.

### Bước 5: Chạy thử với nhân viên

- Một đến hai nhân viên dùng thử một tuần, ban đầu chỉ hỏi (client gbrain chỉ có scope `read`), sau đó mở quyền ghi cho từng thư mục.
- Sau mỗi bước cài đặt, cập nhật [[05-knowledge/server-services]] với đường dẫn, cổng, và lệnh deploy.

## Điều chưa xác minh

Các điểm sau đến từ tài liệu, chưa chạy thử. Kiểm tra trong bước 1 và bước 4, rồi sửa ghi chép này:

- Lệnh chính xác để kết nối một bản clone có sẵn làm nguồn `default` ở managed mode (`gbrain sources connect`, `gbrain sources writer git-durability`, `gbrain sources harden`) và tên cờ cho file PAT.
- gbrain có chấp nhận cấu trúc thư mục COG mà không đổi đường dẫn không.
- gbrain có tự thêm `id` vào frontmatter của file tạo từ Obsidian không. Nếu không, mẫu trong `06-templates/` phải có `id`.
- Cờ `--bound-slug-prefixes` có trong bản gbrain sẽ cài không.
- gbrain có gọi được một API tương thích OpenAI qua base URL (ví dụ 9router) không. Nếu không, dùng API key trực tiếp.
- Client MCP của dewee có tương thích với OAuth 2.1 của gbrain không. Nếu không, gbrain còn hỗ trợ bearer token (`gbrain auth create <tên> --scopes read,write`).
- Container dewee có gọi được URL tailnet của gbrain không. Nếu không, dùng `extra_hosts: host.docker.internal:host-gateway`.
- dewee có cấp quyền MCP theo từng người gửi trong cùng một nhóm không (để chỉ một số nhân viên được ghi). dewee có cấp quyền MCP theo agent và theo user, nhưng trong nhóm thì user là cả nhóm.
- RAM: dewee, gbrain, hai Postgres và các dịch vụ hiện có có vừa 6 GB còn trống không.

## Mở rộng sau

- Giới hạn quyền đọc: tách thành hai nguồn gbrain hoặc hai repo, và chỉ cấp cho dewee nguồn team. Phương án hai repo (A) tách sạch nhất: vault riêng tư không lên server, repo team là thư mục con trên laptop.
- Webhook từ GitHub gọi `gbrain sources refresh` để giảm độ trễ từ laptop lên server.

## Nguồn

- DeepWiki `garrytan/gbrain`: https://deepwiki.com/garrytan/gbrain
- Mã nguồn dewee, bản clone cục bộ `~/Desktop/workspace/opensources/dewee` (branch `dev`, commit `d949d7ea`)
- Trang sản phẩm dewee: https://dewee.sh
