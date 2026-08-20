# 📘 Hướng Dẫn Sử Dụng Zalo OA Node Trong n8n Từ A - Z

Tài liệu này hướng dẫn chi tiết từng bước thao tác thực tế trên giao diện **n8n** để cấu hình và sử dụng bộ node **Zalo OA** (Action Node) và **Zalo OA Trigger** (Webhook Trigger).

---

## 📑 Mục lục
1. [Bước 1: Cài đặt Node vào n8n](#1-bước-1-cài-đặt-node-vào-n8n)
2. [Bước 2: Lấy thông tin & Token từ Zalo](#2-bước-2-lấy-thông-tin--token-từ-zalo)
3. [Bước 3: Tạo Credential trong n8n](#3-bước-3-tạo-credential-trong-n8n)
4. [Bước 4: Các Workflow Thực Tế Thường Dùng](#4-các-workflow-thực-tế-thường-dùng)
   - [Workflow 1: Gửi Tin Nhắn ZBS Template qua Số Điện Thoại](#workflow-1-gửi-tin-nhắn-zbs-template-qua-số-điện-thoại)
   - [Workflow 2: Làm Chatbot AI Tự Động Trả Lời Tin Nhắn Khách Hàng](#workflow-2-làm-chatbot-ai-tự-động-trả-lời-tin-nhắn-khách-hàng)
   - [Workflow 3: Gửi Tin Tư Vấn Đính Kèm Ảnh](#workflow-3-gửi-tin-tư-vấn-đính-kèm-ảnh)
   - [Workflow 4: Lấy Danh Sách & Chi Tiết Khách Hàng Quan Tâm OA](#workflow-4-lấy-danh-sách--chi-tiết-khách-hàng-quan-tâm-oa)
   - [Workflow 5: Đọc Lịch Sử Tin Nhắn Hội Thoại](#workflow-5-đọc-lịch-sử-tin-nhắn-hội-thoại)
5. [Cơ chế Tự Động Làm Mới Token (Auto Token Refresh)](#5-cơ-chế-tự-động-làm-mới-token-auto-token-refresh)
6. [Bảng Tra Cứu Mã Lỗi Zalo Thường Gặp & Cách Khắc Phục](#6-bảng-tra-cứu-mã-lỗi-zalo-thường-gặp)

---

## 1. Bước 1: Cài đặt Node vào n8n

### Cách cài qua giao diện (Community Node):
1. Đăng nhập vào n8n của bạn.
2. Vào **Settings** (biểu tượng bánh răng góc trái dưới) ➔ chọn **Community Nodes**.
3. Bấm **Install a community node**.
4. Dán tên package:
   ```text
   @haus07/n8n-nodes-zalo-oa
   ```
5. Tích vào ô *"I understand the risks..."* ➔ Bấm **Install**.
6. Đợi 10 - 20 giây để n8n tải và cài đặt node.

---

## 2. Bước 2: Lấy thông tin & Token từ Zalo

### 2.1. Lấy App ID & Secret Key
1. Truy cập [developers.zalo.me](https://developers.zalo.me) ➔ Đăng nhập.
2. Bấm vào **Ứng dụng của tôi** ➔ Chọn ứng dụng đã liên kết với Official Account (OA).
3. Tại trang **Tổng quan**, bạn sẽ thấy:
   - **App ID**: Chuỗi số (ví dụ: `123456789012345`)
   - **Secret Key**: Bấm nút *Hiện* để copy mã bảo mật của App.

### 2.2. Lấy Access Token & Refresh Token (Dùng API Explorer nhanh nhất)
1. Vào đường dẫn: **[Zalo API Explorer](https://developers.zalo.me/tools/explorer)**
2. Tại mục **Ứng dụng**: Chọn App của bạn.
3. Tại mục **Loại access token**: Chọn **OA Access Token**.
4. Tại mục **Official Account**: Chọn trang Zalo OA của bạn.
5. Hệ thống hiện bảng cấp quyền ➔ Bấm **Cho phép**.
6. Màn hình sẽ hiện ra:
   - **Access Token** ➔ Bấm nút 📋 để copy.
   - **Refresh Token** ➔ Bấm nút 📋 để copy.

---

## 3. Bước 3: Tạo Credential trong n8n

1. Trong n8n, vào menu **Credentials** (bên trái) ➔ Bấm **Add Credential**.
2. Tìm kiếm **`Zalo OA API`** và bấm chọn.
3. Điền các trường thông tin:

| Tên trường | Giá trị cần điền | Ghi chú |
|---|---|---|
| **Credential Name** | `Zalo OA - Shop của tôi` | Đặt tên gợi nhớ |
| **App ID** | `123456789012345` | App ID lấy ở bước 2.1 |
| **Secret Key** | `AbcXYZ123...` | Secret Key lấy ở bước 2.1 |
| **OA Secret Key** | *(Có thể để trống)* | Nếu OA có secret key webhook riêng thì điền, không thì bỏ trống node sẽ tự lấy Secret Key |
| **Access Token** | `Dán Access Token vào` | Token lấy ở bước 2.2 |
| **Refresh Token** | `Dán Refresh Token vào` | Token lấy ở bước 2.2 |

#### 💡 Cấu hình để tự động lưu Token mới vào Credential (Khuyên dùng):
Điền thêm 3 trường bên dưới để khi Access Token hết hạn, node tự động làm mới và **lưu đè token mới vào credential**:
- **n8n Instance URL**: Điền link n8n của bạn (ví dụ: `https://n8n.yourdomain.com` hoặc `http://localhost:5678`).
- **n8n API Key**: Vào n8n ➔ **Settings ➔ API** ➔ Bấm **Create an API key** ➔ Dán mã vào đây.
- **Credential ID**: Sau khi bấm **Save** credential lần đầu, nhìn lên thanh địa chỉ trình duyệt web:
  - URL có dạng `.../credentials/c12345abcde` ➔ Copy chuỗi `c12345abcde` dán vào ô **Credential ID**.

4. Bấm **Save** ➔ Nếu trạng thái hiện xanh là đã kết nối thành công!

---

## 4. Các Workflow Thực Tế Thường Dùng

---

### Workflow 1: Gửi Tin Nhắn ZBS Template qua Số Điện Thoại
> **Mục đích:** Gửi thông báo đơn hàng, mã OTP, lịch hẹn tới số điện thoại khách hàng.

```text
[Webhook / Trigger bất kỳ] ───► [Zalo OA (Gửi ZBS Template)]
```

#### Thao tác trên node Zalo OA:
1. Kéo node **Zalo OA** vào canvas.
2. Chọn Credential đã tạo ở Bước 3.
3. Cấu hình các tham số:
   - **Resource**: `Tin Nhắn ZBS Template`
   - **Operation**: `Gửi ZBS Template`
   - **Số Điện Thoại Người Nhận**: Nhập số điện thoại (ví dụ: `0987654321` hoặc `{{ $json.customer_phone }}`). *Node sẽ tự động chuyển về dạng chuẩn `84987654321`*.
   - **Template ID**: Điền ID mẫu ZBS đã duyệt (ví dụ: `342981`).
   - **Dữ Liệu Template (Template Data)**: Bấm nút **Add Item** để thêm từng biến:
     - Biến 1: `Tên Biến (Key)`: `customer_name` ➔ `Giá Trị (Value)`: `Nguyễn Văn A`
     - Biến 2: `Tên Biến (Key)`: `order_code` ➔ `Giá Trị (Value)`: `HD-9988`
     - Biến 3: `Tên Biến (Key)`: `total_amount` ➔ `Giá Trị (Value)`: `350.000đ`
   - **Chế Độ Gửi**: Chọn `Gửi Thường (Trong Hạn Mức)` (mặc định).
4. Bấm **Test step** để gửi thử tin nhắn.

---

### Workflow 2: Làm Chatbot AI Tự Động Trả Lời Tin Nhắn Khách Hàng
> **Mục đích:** Khách nhắn tin vào Zalo OA ➔ AI suy nghĩ câu trả lời ➔ Tự động gửi tin nhắn phản hồi lại cho khách.

```text
[Zalo OA Trigger] ───► [AI Agent / OpenAI Node] ───► [Zalo OA (Tin Tư Vấn)]
```

#### Bước 2.1: Cấu hình Webhook trên Zalo OA
1. Kéo node **Zalo OA Trigger** vào canvas n8n.
2. Copy đường dẫn **Production URL** hiển thị trên node (ví dụ: `https://n8n.domain.com/webhook/zalo-oa`).
3. Truy cập [oa.zalo.me](https://oa.zalo.me) ➔ Chọn OA của bạn ➔ **Quản lý ứng dụng ➔ Cấu hình Webhook**.
4. Dán URL vừa copy vào ô Webhook và tích chọn sự kiện: **`user_send_text` (Người dùng gửi tin nhắn)**.

#### Bước 2.2: Cấu hình node Zalo OA Trigger trong n8n
1. **Sự Kiện Lắng Nghe**: Chọn `User Send Text` (hoặc `All User Send Events`).
2. **Chỉ Nhận Message Gốc (Ignore OA Echo)**: Bật `true` (để tránh chatbot bị lặp vô tận khi tự gửi tin nhắn).
3. **Trả Dữ Liệu Dạng Rút Gọn (Simplify)**: Bật `true` (node sẽ tự trích xuất sẵn `user_id` và nội dung chữ `text` ra ngoài).

#### Bước 2.3: Cấu hình node AI (OpenAI / Claude / AI Agent)
- Prompt: `Bạn là nhân viên CSKH thông minh. Hãy trả lời câu hỏi của khách hàng: {{ $json.text }}`

#### Bước 2.4: Cấu hình node Zalo OA để gửi câu trả lời
1. Kéo node **Zalo OA** vào sau node AI.
2. Chọn:
   - **Resource**: `Tin Tư Vấn (CS Message)`
   - **Operation**: `Gửi Tin Tư Vấn Dạng Văn Bản`
   - **User ID**: Bấm sang tab Expression và điền:
     ```javascript
     {{ $('Zalo OA Trigger').item.json.user_id }}
     ```
   - **Nội Dung Văn Bản**: Điền kết quả từ node AI:
     ```javascript
     {{ $json.output || $json.text }}
     ```

---

### Workflow 3: Gửi Tin Tư Vấn Đính Kèm Ảnh
> **Mục đích:** Gửi ảnh sản phẩm, hoá đơn hoặc hướng dẫn kèm chú thích cho khách hàng đã nhắn tin với OA trong 7 ngày.

#### Thao tác trên node Zalo OA:
1. **Resource**: `Tin Tư Vấn (CS Message)`
2. **Operation**: `Gửi Tin Tư Vấn Đính Kèm Ảnh`
3. **User ID**: Nhập `user_id` người nhận.
4. **Nguồn Ảnh (Image Source)**: Chọn `URL Ảnh Công Khai`.
5. **URL Ảnh**: Điền link ảnh trực tiếp (ví dụ: `https://example.com/san-pham-1.jpg`).
6. **Chú Thích (Caption)**: Nhập đoạn văn bản mô tả kèm theo ảnh.

---

### Workflow 4: Lấy Danh Sách & Chi Tiết Khách Hàng Quan Tâm OA

#### Lấy danh sách người dùng:
1. **Resource**: `Người Dùng (User)`
2. **Operation**: `Truy Xuất Danh Sách Người Dùng`
3. **Số Lượng (Count)**: `50`
4. **Tương Tác Gần Nhất**: Chọn `7 Ngày Gần Nhất (L7D)` hoặc `30 Ngày Gần Nhất (L30D)`.

#### Lấy chi tiết 1 người dùng:
1. **Resource**: `Người Dùng (User)`
2. **Operation**: `Truy Xuất Chi Tiết Người Dùng`
3. **User ID**: Điền ID người dùng cần xem.

---

### Workflow 5: Đọc Lịch Sử Tin Nhắn Hội Thoại
1. **Resource**: `Hội Thoại (Conversation)`
2. **Operation**: `Lấy Chi Tiết Hội Thoại`
3. **User ID**: Điền ID người dùng cần đọc tin nhắn.
4. **Số Lượng (Count)**: Số lượng tin nhắn gần nhất cần lấy (tối đa 10 tin/lần).

---

## 5. Cơ chế Tự Động Làm Mới Token (Auto Token Refresh)

- **Access Token của Zalo chỉ có hạn 25 giờ.**
- Với bản cập nhật v2.0, bạn **không cần phải canh giờ refresh thủ công**:
  - Khi bất kỳ node Zalo OA nào trong workflow chạy và gặp lỗi hết hạn token (mã lỗi `-124`, `3`, `-216`, `-220`), **node sẽ tự động lấy Refresh Token để xin Access Token mới và tự động gửi lại request ngay lập tức**.
  - Nếu bạn đã điền đầy đủ `n8n Instance URL`, `n8n API Key`, và `Credential ID`, token mới sẽ tự động được lưu lại vào hệ thống.

---

## 6. Bảng Tra Cứu Mã Lỗi Zalo Thường Gặp

| Mã Lỗi | Nguyên nhân | Cách xử lý |
|:---:|---|---|
| **`-124`** hoặc **`3`** | Access Token hết hạn | Node sẽ tự động làm mới. Nếu thất bại, hãy kiểm tra lại Refresh Token trong Credential. |
| **`-201`** | Người dùng chưa quan tâm OA hoặc ngoài cửa sổ 7 ngày | Tin tư vấn CS chỉ gửi được cho khách hàng có nhắn tin vào OA trong vòng 7 ngày gần nhất. |
| **`-5`** | Số điện thoại không hợp lệ | Kiểm tra lại số điện thoại người nhận (phải có đăng ký Zalo). |
| **`-6`** | Không tìm thấy Template ID | Kiểm tra lại ID mẫu tin ZBS xem đã duyệt thành công trên Zalo Cloud chưa. |
| **`-7`** | Dữ liệu Template không hợp lệ | Kiểm tra tên các biến trong `Template Data` xem đã khớp 100% với tên biến đã đăng ký trên mẫu Zalo chưa. |
| **`-216`** | Vượt hạn mức gọi API (Rate limit) | Giảm tần suất gọi API hoặc dùng node **Wait** (delay 200ms) giữa các vòng lặp. |
