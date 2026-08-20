# n8n-nodes-zalo-oa

**n8n community node** tích hợp **Zalo Official Account (Zalo OA)** vào workflow n8n — hỗ trợ **Webhook Trigger** nhận tin nhắn realtime từ người dùng, **gửi tin tư vấn (CS Message)** để tự động phản hồi chatbot AI, gửi **ZBS Template Message** qua số điện thoại, quản lý người dùng/hội thoại và **tự động làm mới Access Token (Auto-refresh on Expiry)**.

[![GitHub license](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![n8n community node](https://img.shields.io/badge/n8n-community%20node-FF6D5A)](https://docs.n8n.io/integrations/community-nodes/)
[![GitHub repo](https://img.shields.io/badge/GitHub-haus07%2Fn8n--zaloOA-181717?logo=github)](https://github.com/haus07/n8n-zaloOA)

---

## 📋 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng nổi bật (v2.0)](#-tính-năng-nổi-bật-v20)
- [Cài đặt](#-cài-đặt)
- [Cấu hình Credential](#-cấu-hình-credential)
- [Lấy Access Token và Refresh Token từ Zalo](#-lấy-access-token-và-refresh-token-từ-zalo)
  - [Cách 1: Sử dụng API Explorer (Khuyên dùng)](#cách-1-sử-dụng-api-explorer-khuyên-dùng)
  - [Cách 2: Sử dụng OAuth v4 (Tích hợp programmatic)](#cách-2-sử-dụng-oauth-v4-tích-hợp-programmatic)
- [Zalo OA Trigger (Webhook)](#-zalo-oa-trigger-webhook)
- [Xây dựng Chatbot AI với Zalo OA](#-xây-dựng-chatbot-ai-với-zalo-oa)
- [Chi tiết các Resource & Operation](#-chi-tiết-các-resource--operation)
- [Ví dụ sử dụng](#-ví-dụ-sử-dụng)
- [Lưu ý về Rate Limit](#️-lưu-ý-giới-hạn-tốc-độ-gọi-api-rate-limit)
- [Lịch sử phiên bản (Version History)](#-lịch-sử-phiên-bản)
- [Tác giả](#-tác-giả)

---

## 🌟 Giới thiệu

Package cung cấp bộ công cụ toàn diện gồm **2 node**:

1. **Zalo OA** (Action Node): Gọi các API OpenAPI / Zalo Business Solution (ZBS) để gửi tin nhắn, lấy thông tin profile, truy vấn người dùng, hội thoại và quản lý token.
2. **Zalo OA Trigger** (Webhook Trigger Node): Nhận các sự kiện webhook realtime từ Zalo OA để kích hoạt workflow n8n (Chatbot AI, tự động hoá CSKH, phân loại khách hàng...).

---

## 🚀 Tính năng nổi bật (v2.0)

- 🔥 **Tự động làm mới Token (Auto-refresh on Expiry)**: Khi Access Token hết hạn trong lúc gọi API (mã lỗi `-124`, `3`, `-216`, `-220`), node **tự động gọi refresh token và thử lại ngay lập tức** mà không làm ngắt quãng workflow.
- 💾 **Non-blocking Token Persistence**: Tự động lưu Access Token & Refresh Token mới vào n8n Credential qua n8n REST API (không làm crash workflow nếu kết nối lưu trữ gặp sự cố).
- 🧩 **GUI Key-Value cho Template Data**: Hỗ trợ nhập các biến template dạng danh sách trực quan (Key - Value) ngay trên giao diện n8n mà không cần tự viết chuỗi JSON.
- 📞 **Tự động chuẩn hoá & kiểm tra Số điện thoại**: Hỗ trợ mọi định dạng `0912345678`, `+84912345678`, `84912345678` (tự loại bỏ dấu cách, dấu gạch nối và chuẩn hoá về đầu `84`).
- 💬 **Tin Tư Vấn CS Message Đa Dạng**: Gửi tin nhắn tư vấn dạng **văn bản** hoặc **hình ảnh** (URL công khai hoặc Attachment ID) kèm caption đến khách hàng trong cửa sổ tương tác 7 ngày.
- 🛡️ **Bảo mật & Whitelist Domain**: Tích hợp sẵn `oauth.zaloapp.com`, `openapi.zalo.me`, `business.openapi.zalo.me` vào danh sách domain an toàn.
- 🌐 **Mapping mã lỗi Zalo chi tiết bằng Tiếng Việt**: Cung cấp thông báo lỗi rõ nghĩa, dễ hiểu khi gọi API không thành công.

---

## 📦 Cài đặt

### Cài đặt qua giao diện n8n (Community Nodes)

1. Mở n8n → Vào **Settings → Community Nodes**.
2. Nhấn **Install a community node**.
3. Nhập tên package: `n8n-nodes-zalo-oa` (hoặc cài đặt từ repository: `https://github.com/haus07/n8n-zaloOA`).
4. Đồng ý điều khoản và nhấn **Install**.

### Cài đặt thủ công (Self-hosted / Docker)

Trong thư mục cài đặt n8n hoặc thư mục `.n8n/custom`:

```bash
npm install n8n-nodes-zalo-oa
```

---

## 🔑 Cấu hình Credential

Tạo credential **Zalo OA API** trong n8n với các trường sau:

| Trường | Bắt buộc | Mô tả |
|---|:---:|---|
| **Credential Name** | ✅ | Tên phân biệt credential (ví dụ: `Zalo OA - Shop Demo`) |
| **App ID** | ✅ | Lấy tại [developers.zalo.me](https://developers.zalo.me) → App của bạn → App ID |
| **Secret Key** | ✅ | Lấy tại [developers.zalo.me](https://developers.zalo.me) → App của bạn → Secret Key |
| **OA Secret Key (Webhook Signature)** | ❌ | Secret key dùng để xác thực webhook signature của OA (nếu để trống sẽ fallback về `Secret Key`) |
| **Access Token** | ✅ | Access Token của Zalo OA (hiệu lực 25h) |
| **Refresh Token** | ✅ | Refresh Token dùng để cấp Access Token mới (hiệu lực 3 tháng) |
| **n8n Instance URL** | ❌ | URL n8n của bạn, ví dụ: `http://localhost:5678` hoặc `https://n8n.yourdomain.com` *(dùng để tự ghi đè token mới vào credential)* |
| **n8n API Key** | ❌ | Tạo tại **Settings → API → Create an API key** *(dùng để tự ghi đè token)* |
| **Credential ID** | ❌ | ID của credential này trên URL trình duyệt: `/credentials/<ID>` *(dùng để tự ghi đè token)* |
| **Allowed Domains** | Mặc định | `oauth.zaloapp.com,openapi.zalo.me,business.openapi.zalo.me` |

> 💡 **Mẹo:** Khi điền đủ 3 trường **n8n Instance URL**, **n8n API Key**, và **Credential ID**, node sẽ **tự động lưu token mới** vào n8n sau mỗi lần làm mới token (cả auto-refresh khi hết hạn và refresh thủ công).

---

## 📲 Lấy Access Token và Refresh Token từ Zalo

### Cách 1: Sử dụng API Explorer (Khuyên dùng)

> Thích hợp cho Quản trị viên muốn lấy nhanh token để chạy ngay.

1. Truy cập công cụ **[Zalo API Explorer](https://developers.zalo.me/tools/explorer)**.
2. Chọn **Ứng dụng** của bạn.
3. Tại mục **Loại access token**, chọn **OA Access Token**.
4. Chọn **Official Account (OA)** muốn liên kết và cấp quyền.
5. Nhấn **Cho phép** cấp quyền cho ứng dụng.
6. Copy **Access Token** và **Refresh Token** dán vào Credential n8n.

### Cách 2: Sử dụng OAuth v4 (Tích hợp programmatic)

1. Tạo App trên [developers.zalo.me](https://developers.zalo.me) và liên kết với OA.
2. Tạo PKCE `code_verifier` và `code_challenge`.
3. Xin Authorization Code qua URL:
   ```text
   https://oauth.zaloapp.com/v4/oa/permission?app_id=YOUR_APP_ID&redirect_uri=YOUR_CALLBACK_URL&code_challenge=YOUR_CODE_CHALLENGE
   ```
4. Đổi Code lấy Token:
   ```bash
   curl -X POST https://oauth.zaloapp.com/v4/oa/access_token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -H "secret_key: YOUR_SECRET_KEY" \
     -d "app_id=YOUR_APP_ID&code=AUTHORIZATION_CODE&grant_type=authorization_code&code_verifier=YOUR_CODE_VERIFIER"
   ```

---

## ⚡ Zalo OA Trigger (Webhook)

Node **Zalo OA Trigger** nhận các sự kiện realtime từ Zalo OA.

### Cấu hình Webhook trên Zalo OA:
1. Thêm node **Zalo OA Trigger** vào workflow và copy **Webhook URL**.
2. Vào [Zalo OA Management](https://oa.zalo.me) → **Quản lý ứng dụng → Cấu hình Webhook** → dán Webhook URL.
3. Chọn các sự kiện cần lắng nghe:
   - `user_send_text`, `user_send_image`, `user_send_link`, `user_send_audio`, `user_send_video`, `user_send_sticker`, `user_send_location`, `user_send_file`, `user_send_gif`, `user_send_business_card`, `user_send_contact`.
   - `follow`, `unfollow`, `user_submit_info`, `user_seen_message`, `user_received_message`.

### Các tham số tuỳ chọn:
- **Events**: Lọc theo sự kiện cụ thể hoặc chọn `All User Send Events` để bắt tất cả tin nhắn từ người dùng.
- **Ignore OA Echo**: Bật để bỏ qua tin nhắn do chính OA gửi đi (tránh lặp vô tận khi chatbot trả lời).
- **Verify Signature**: Xác thực chữ ký `X-ZEvent-Signature` chuẩn bảo mật Zalo.
- **Simplify**: Trả dữ liệu phẳng, tối ưu sẵn các trường `user_id`, `text`, `msg_id` để kết nối thẳng vào AI Agent / LLM.

---

## 🤖 Xây dựng Chatbot AI với Zalo OA

Mô hình kết hợp n8n AI Agent và Zalo OA:

```text
[Zalo OA Trigger] 
       │  (Output: user_id, text, msg_id)
       ▼
[AI Agent / OpenAI / Claude / Gemini] 
       │  (System prompt: Trợ lý CSKH tư vấn thông minh...)
       │  (Output: câu trả lời)
       ▼
[Zalo OA] 
       Resource: Tin Tư Vấn (CS Message)
       Operation: Gửi Tin Tư Vấn Dạng Văn Bản
       User ID: {{ $('Zalo OA Trigger').item.json.user_id }}
       Nội Dung: {{ $json.output }}
```

---

## 🛠️ Chi tiết các Resource & Operation

### 1. Tin Tư Vấn (CS Message)
Gửi tin nhắn phản hồi tới khách hàng trong cửa sổ 7 ngày:
- **Gửi Tin Tư Vấn Dạng Văn Bản**: Gửi tin text (tối đa 500 ký tự).
- **Gửi Tin Tư Vấn Đính Kèm Ảnh**: Gửi hình ảnh qua **URL công khai** hoặc **Attachment ID** đã upload, kèm caption tuỳ chọn.

### 2. Tin Nhắn ZBS Template (Message)
Gửi tin nhắn mẫu chăm sóc khách hàng/thông báo qua số điện thoại:
- **Số Điện Thoại**: Tự động chuẩn hoá (`0987654321` → `84987654321`).
- **Template ID**: ID mẫu tin ZBS đã được phê duyệt.
- **Dữ Liệu Template**: Thêm biến linh hoạt dạng Key - Value qua giao diện n8n.
- **Chế Độ Gửi**: Gửi thường (trong hạn mức) hoặc Gửi vượt hạn mức.
- **Tracking ID**: Mã theo dõi tuỳ chỉnh.

### 3. Người Dùng (User)
- **Truy Xuất Chi Tiết Người Dùng**: Lấy thông tin họ tên, avatar, trạng thái tương tác qua `User ID`.
- **Truy Xuất Danh Sách Người Dùng**: Lấy danh sách kèm bộ lọc theo nhãn (`tagName`), thời gian tương tác (`TODAY`, `YESTERDAY`, `L7D`, `L30D`), trạng thái quan tâm (`isFollower`).

### 4. Hội Thoại (Conversation)
- **Lấy Chi Tiết Hội Thoại**: Đọc nội dung các tin nhắn trao đổi trong hội thoại với người dùng cụ thể.

### 5. Thông Tin OA
- **Lấy Thông Tin OA**: Lấy thông tin chung của Official Account (Tên, ID, Avatar, Cover, Số người quan tâm...).

### 6. Token
- **Refresh Token**: Chủ động làm mới Access Token thủ công và ghi đè vào n8n credential.

---

## 💡 Ví dụ sử dụng

### Gửi thông báo đơn hàng qua ZBS Template

- **Resource**: `Tin Nhắn ZBS Template`
- **Số Điện Thoại**: `0912345678`
- **Template ID**: `312456`
- **Dữ Liệu Template (Key-Value)**:
  - `customer_name` ➔ `Nguyễn Văn A`
  - `order_code` ➔ `HD10293`
  - `total_price` ➔ `450.000đ`

---

## ⚠️ Lưu ý: Giới hạn tốc độ gọi API (Rate Limit)

Zalo OA áp dụng Rate Limit theo từng loại tài khoản và endpoint.
- Nếu gửi hàng loạt (batch messaging), nên sử dụng node **Wait** hoặc chia nhỏ lô (Loop / Split in Batches) với độ trễ tối thiểu `100ms - 200ms` giữa các request để tránh bị Zalo tạm chặn (mã lỗi `-32` hoặc `-216`).

---

## 📜 Lịch sử phiên bản

### v2.0.0 (2026-08)
- 🚀 **Auto Token Refresh**: Tự động làm mới Access Token và thử lại ngay khi gặp mã lỗi hết hạn token (`-124`, `3`, `-216`, `-220`) trong bất kỳ API call nào.
- 💾 **Non-blocking Persistence**: Ghi đè token mới vào credential n8n trong nền mà không làm gián đoạn luồng chạy.
- 🧩 **FixedCollection GUI**: Cung cấp giao diện nhập biến template dạng Key-Value trực quan thay vì JSON string.
- 📞 **Phone Normalizer**: Tự động chuẩn hoá và validate định dạng số điện thoại Việt Nam.
- 🛡️ **Whitelist Domain**: Bổ sung sẵn `business.openapi.zalo.me` vào cấu hình domain an toàn.
- 🌐 **Vietnamese Error Mapping**: Cung cấp bảng mã lỗi Zalo song ngữ chi tiết.
- 🏗️ **GenericFunctions Architecture**: Tách module helper, chuẩn hoá TypeScript type-safe 100%.

---

## 👤 Tác giả

- **haus07**
- GitHub: [@haus07](https://github.com/haus07)
- Repository: [https://github.com/haus07/n8n-zaloOA](https://github.com/haus07/n8n-zaloOA)

---

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép **MIT License**.
