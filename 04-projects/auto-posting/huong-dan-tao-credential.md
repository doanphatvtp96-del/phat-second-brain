---
title: Hướng dẫn tạo Google Sheet và credential
updated: 2026-10-20
parent: "[[04-projects/auto-posting/README]]"
---

# Hướng dẫn tạo Google Sheet và credential

Credential là "chìa khóa" để n8n vào tài khoản của bạn thay bạn. Giống như bạn đưa cho người giúp việc một chìa khóa riêng chỉ mở được đúng một cửa: n8n cầm chìa đó để ghi vào Google Sheet và đăng bài lên Facebook Page, mà không cần biết mật khẩu của bạn. Bạn cần làm 4 phần dưới đây, mỗi phần khoảng 10–15 phút.

**Quy tắc an toàn:** không gửi file key, token hay mật khẩu vào chat. Bạn chỉ dán chúng vào n8n. Mình đọc được tên và ID của credential qua API, nên không cần thấy giá trị bên trong.

Thứ tự nên làm: Phần 1 → Phần 2 → Phần 3 → Phần 4. Làm xong phần nào thì đánh dấu ✅ phần đó.

---

## Phần 1. Tạo Google Sheet

1. Mở trình duyệt, đăng nhập Gmail của bạn, rồi vào **https://sheets.new**. Một bảng tính trống sẽ mở ra.
2. Bấm vào chữ "Bảng tính không có tiêu đề" ở góc trên bên trái, rồi đặt tên là `Auto posting`.
3. Ở dưới cùng có một tab tên `Trang tính1`. Bấm đúp vào tab đó và đổi tên thành `Posts`.
4. Bấm dấu **+** ở góc dưới bên trái 3 lần để thêm 3 tab nữa. Đổi tên lần lượt thành `Deliveries`, `Routes`, `Targets`.
5. Với từng tab: bấm vào ô **A1**, rồi dán đúng khối chữ tương ứng trong mục "Setup steps" của [[04-projects/auto-posting/README]]. Chữ sẽ tự tách ra thành từng cột.
6. Ở tab `Posts`: bấm vào ô vuông nhỏ ở góc trên bên trái (bên trái chữ A) để chọn cả bảng. Rồi vào menu **Định dạng → Số → Văn bản thuần túy**. Làm tương tự với tab `Deliveries`. Bước này giữ nguyên ngày giờ, để Google không tự đổi định dạng.
7. Nhìn lên thanh địa chỉ. Link có dạng:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit`
   Phần in đậm nằm giữa `/d/` và `/edit` là **Sheet ID**. Copy và cất lại; lát nữa bạn gửi cho mình.

✅ Xong phần 1 khi: có 4 tab, mỗi tab có dòng tiêu đề, và bạn đã có Sheet ID.

---

## Phần 2. Google Service Account (để n8n ghi vào Sheet)

Service Account là một "tài khoản robot" của Google. Bạn share Sheet cho robot này, và n8n đăng nhập bằng robot đó.

### 2.1. Tạo project trên Google Cloud

1. Vào **https://console.cloud.google.com** và đăng nhập cùng Gmail ở phần 1. Nếu Google hỏi điều khoản, chọn quốc gia Việt Nam và đồng ý. Phần này **miễn phí**, không cần thẻ.
2. Ở thanh trên cùng, bấm nút chọn project (cạnh logo Google Cloud), rồi bấm **New Project** (Dự án mới).
3. Đặt tên `n8n-auto-post`, rồi bấm **Create**. Đợi khoảng 30 giây.
4. Bấm lại nút chọn project và chọn `n8n-auto-post`. Kiểm tra tên project hiện ở thanh trên cùng.

### 2.2. Bật Google Sheets API

1. Ở ô tìm kiếm trên cùng, gõ `Google Sheets API`, rồi bấm kết quả có biểu tượng bảng tính xanh lá.
2. Bấm **Enable** (Bật).
3. Làm tương tự với `Google Drive API`. n8n dùng API này để tìm file.

### 2.3. Tạo Service Account và tải key

1. Ở ô tìm kiếm, gõ `Service Accounts`, rồi bấm kết quả thuộc mục "IAM & Admin".
2. Bấm **+ Create service account**.
3. Ở ô "Service account name", gõ `n8n-sheets`, rồi bấm **Create and continue**.
4. Ở bước "Grant this service account access", **bỏ qua**: bấm **Continue**, rồi **Done**.
5. Trong danh sách hiện ra một dòng có email dạng `n8n-sheets@n8n-auto-post.iam.gserviceaccount.com`. **Copy email này**, vì bạn cần nó ở bước 2.5.
6. Bấm vào email đó, chọn tab **Keys**, bấm **Add key → Create new key**, chọn **JSON**, rồi bấm **Create**.
7. Máy tải về một file `.json`. Đây là chìa khóa, nên **giữ kỹ và không gửi cho ai**.

> Nếu bấm Create key mà Google báo "Service account key creation is disabled", tài khoản của bạn đang thuộc một tổ chức có chặn tính năng này. Hãy dùng Gmail cá nhân, hoặc nhờ admin của tổ chức mở khóa.

### 2.4. Dán key vào n8n

1. Mở file `.json` vừa tải bằng **Notepad**: chuột phải vào file → Open with → Notepad.
2. Mở n8n: **http://ps.taildae6a9.ts.net:5678** và đăng nhập.
3. Ở góc trên bên trái, bấm mũi tên cạnh nút **Create** (hoặc nút **+**), rồi chọn **Credential**.
4. Gõ `Google Service Account`, chọn **Google Service Account API**, rồi bấm **Continue**.
5. Điền:
   - **Service Account Email:** giá trị của `"client_email"` trong file JSON, không lấy dấu ngoặc kép.
   - **Private Key:** giá trị của `"private_key"`, bắt đầu từ `-----BEGIN PRIVATE KEY-----` và kết thúc ở `-----END PRIVATE KEY-----\n`. Copy cả đoạn đó, không lấy dấu ngoặc kép hai đầu.
   - Để trống các ô còn lại, và **tắt** mục "Set up for use in HTTP Request node" nếu có.
6. Ở góc trên của cửa sổ, bấm vào tên credential và đổi thành `Google Service Account`.
7. Bấm **Save**. Nếu hiện dấu tích xanh "Connection tested successfully" là xong.

### 2.5. Share Sheet cho robot

1. Quay lại Google Sheet ở phần 1, rồi bấm nút **Chia sẻ** (Share) ở góc trên bên phải.
2. Dán email robot đã copy ở bước 2.3.5.
3. Chọn quyền **Người chỉnh sửa** (Editor), **bỏ tích** "Thông báo cho mọi người", rồi bấm **Chia sẻ**.

Nếu Google hỏi "chia sẻ ra ngoài tổ chức?", chọn **Vẫn chia sẻ**.

✅ Xong phần 2 khi: n8n có credential `Google Service Account` đã test thành công, và Sheet đã share cho email robot.

---

## Phần 3. Facebook Page token (để n8n đăng bài)

Bạn cần là **admin của Facebook Page** muốn đăng bài. Phần này có nhiều bước nhất, nên làm chậm từng bước.

Token có 3 loại, và thứ tự lấy như sau: token người dùng ngắn hạn (sống khoảng 1 giờ) → token người dùng dài hạn (60 ngày) → **token Page dài hạn** (không hết hạn). n8n cần loại cuối cùng.

### 3.1. Tạo app trên Meta for Developers

1. Vào **https://developers.facebook.com**, đăng nhập bằng Facebook cá nhân (tài khoản đang là admin Page).
2. Nếu lần đầu vào, bấm **Get started** và làm theo để đăng ký tài khoản developer. Bước này cần xác minh số điện thoại.
3. Bấm **My Apps → Create App**.
4. Đặt tên app, ví dụ `Auto Post n8n`, rồi bấm **Next**.
5. Ở phần chọn mục đích (use case), chọn mục có chữ **"Manage everything on your Page"** (quản lý Page). Nếu không thấy mục này, chọn **Other**, rồi chọn loại app **Business**.
6. Bấm qua các bước còn lại, rồi **Create app**. Facebook có thể hỏi lại mật khẩu.

### 3.2. Lấy token người dùng ngắn hạn

1. Vào **https://developers.facebook.com/tools/explorer** (Graph API Explorer).
2. Ở cột bên phải, mục **Meta App**, chọn app `Auto Post n8n`.
3. Mục **User or Page**, chọn **User Token**.
4. Mục **Permissions**, bấm **Add a Permission** và thêm đủ 3 quyền:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`
5. Bấm **Generate Access Token**. Một cửa sổ Facebook hiện ra: chọn **đúng Page** bạn muốn đăng, rồi bấm Tiếp tục và Cho phép hết.
6. Ô **Access Token** giờ có một chuỗi dài. Đây là token ngắn hạn, chỉ sống khoảng 1 giờ, nên làm tiếp bước 3.3 ngay.

### 3.3. Đổi sang token người dùng dài hạn

1. Bấm biểu tượng **ⓘ** ở đầu ô Access Token, rồi chọn **Open in Access Token Tool**. Nếu không thấy, mở **https://developers.facebook.com/tools/debug/accesstoken**, dán token vào và bấm **Debug**.
2. Kéo xuống cuối trang, rồi bấm **Extend Access Token**. Facebook có thể hỏi lại mật khẩu.
3. Dưới nút này hiện ra một token mới, sống 60 ngày. Bấm **Debug** cạnh token đó để chắc chắn là token mới, rồi **copy token mới**.

### 3.4. Lấy token Page dài hạn và Page ID

1. Quay lại **Graph API Explorer**, rồi dán token dài hạn vừa copy vào ô **Access Token** (xóa token cũ).
2. Ở ô truy vấn phía trên (thường có sẵn `me?fields=id,name`), xóa hết và gõ: `me/accounts`
3. Bấm **Submit**.
4. Kết quả có danh sách Page bạn quản lý. Tìm đúng Page theo `"name"`, rồi lấy 2 giá trị:
   - `"access_token"`: đây là **token Page dài hạn**. Copy cả chuỗi.
   - `"id"`: đây là **Page ID**. Copy và cất lại để gửi cho mình. Page ID không phải bí mật.
5. Kiểm tra: dán token Page vào **Access Token Debugger** và bấm Debug. Dòng **Expires** phải là **Never** (không bao giờ hết hạn). Nếu nó hiện khoảng 1 giờ, bạn đã dùng nhầm token ngắn hạn ở bước 3.4.1, nên làm lại bước 3.3.

### 3.5. Dán token vào n8n

1. Trong n8n, vào **Create → Credential**.
2. Gõ `Facebook Graph`, chọn **Facebook Graph API**, rồi bấm **Continue**.
3. Dán **token Page** vào ô **Access Token**.
4. Đổi tên credential thành `Facebook Page token`, rồi bấm **Save**.

> **Lưu ý:** khi app còn ở chế độ **Development**, có thể chỉ bạn thấy bài đăng. Nếu đăng thử mà người khác không thấy, bạn cần chuyển app sang **Live**. Facebook sẽ yêu cầu link chính sách quyền riêng tư (Privacy Policy) trước khi cho chuyển. Mình sẽ báo nếu gặp trường hợp này lúc test.

✅ Xong phần 3 khi: n8n có credential `Facebook Page token`, Debugger báo token "Expires: Never", và bạn đã có Page ID.

---

## Phần 4. Token cho webhook (để AI gửi bài vào hệ thống)

Token này là mật khẩu riêng của hệ thống. AI phải kèm nó mỗi lần gửi bài, để người lạ không gửi bài vào Sheet được.

### 4.1. Tạo một chuỗi ngẫu nhiên

1. Bấm phím **Windows**, gõ `PowerShell`, rồi mở **Windows PowerShell**.
2. Dán dòng sau vào cửa sổ và nhấn **Enter**:
   `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | ForEach-Object {[char]$_})`
3. Cửa sổ in ra một chuỗi 48 ký tự. Bôi đen chuỗi đó, copy, rồi cất vào một chỗ an toàn (trình quản lý mật khẩu hoặc ghi chú riêng).

### 4.2. Dán vào n8n

1. Trong n8n, vào **Create → Credential**.
2. Gõ `Header Auth`, chọn **Header Auth**, rồi bấm **Continue**.
3. Điền:
   - **Name:** `X-API-Key` (gõ đúng chữ hoa, chữ thường)
   - **Value:** chuỗi 48 ký tự vừa tạo
4. Đổi tên credential thành `Posts API token`, rồi bấm **Save**.

✅ Xong phần 4 khi: n8n có credential `Posts API token`, và bạn đã cất chuỗi token ở chỗ an toàn.

---

## Gửi lại cho mình

Khi xong cả 4 phần, nhắn cho mình đúng 2 thông tin sau. Cả hai đều không phải bí mật:

1. **Sheet ID** (phần 1, bước 7)
2. **Page ID** (phần 3, bước 3.4)

Mình sẽ tự tìm 3 credential `Google Service Account`, `Facebook Page token` và `Posts API token` trong n8n, gắn chúng vào workflow, rồi test.

## Khi bị kẹt

Chụp màn hình chỗ bị kẹt và gửi cho mình. **Che hoặc cắt** mọi token, private key và email robot trước khi gửi.
