# Kiến trúc bản đầu

## Thành phần

- `apps/web`: giao diện Next.js.
- `apps/api`: NestJS, nghiệp vụ và kết nối dịch vụ ngoài.
- `apps/api/prisma`: PostgreSQL schema và migration.
- `packages/contracts`: kiểu dữ liệu trao đổi giữa frontend/backend.
- `docs`: hướng dẫn setup, triển khai, backup.

Trình duyệt gửi `/api/*` đến Next.js. Next.js rewrite cùng path sang NestJS để cookie phiên thuộc cùng origin. NestJS xác minh cookie phiên, tìm thành viên workspace rồi mới đọc/ghi dữ liệu Prisma. Frontend không kết nối trực tiếp đến PostgreSQL hoặc Supabase Data API.

## Cách ly workspace

Một `Couple` là một workspace, có tối đa hai `CoupleMember`. Tài khoản chỉ tham gia một workspace ở bản đầu. Mọi truy vấn câu chuyện đều giới hạn bằng `coupleId` từ thành viên đã đăng nhập; không coi ID mà trình duyệt gửi là quyền truy cập. Link mời chứa token ngẫu nhiên, database chỉ lưu SHA-256 của token.

## Câu chuyện, streak và AI

Một người có tối đa một `DailyStory` cho mỗi ngày/workspace; mỗi lần chia sẻ thêm là một `StoryEntry` có timestamp riêng. Ngày nghiệp vụ là `DATE` theo múi giờ workspace, thời gian sự kiện lưu UTC. Một ngày kéo dài 27 giờ: từ 00:00 tới 03:00 sáng hôm sau, nên khung 00:00–03:00 thuộc cả hôm trước lẫn hôm nay. `StoryEntry` vẫn lưu dưới ngày đã chọn khi gửi; khi đọc một ngày (chat, bảng kỷ niệm, streak, tóm tắt), các entry của ngày liền kề được viết trong khung 27 giờ của ngày đó cũng được tính (`entryDays` trong `apps/api/src/shared/dates.ts`). Trước 03:00, "Hôm nay" vẫn mở cuộc trò chuyện của hôm trước. Một ngày chỉ đủ streak khi cả hai có ít nhất một bài đã đăng chứa chữ hoặc ảnh. Streak tạm giữ trong ngày và chỉ mất sau khi bỏ lỡ trọn ngày.

Tóm tắt lấy văn bản đã đăng của hai tài khoản, theo cùng workspace/ngày. Ảnh, nháp và bình luận không gửi tới LLM. Cache dùng hash tổng nguồn. Sửa bài làm bản cũ stale; xóa bài ẩn/xóa bản tóm tắt chung có liên quan. Quota 5 lần tạo tóm tắt/workspace/ngày được giữ trong PostgreSQL.

## Tệp ảnh

Mặc định local dùng `.local-media`, bị Git bỏ qua. Production cấu hình `STORAGE_DRIVER=supabase` và bucket private. `Media.storagePath` lưu định danh object; trình duyệt chỉ tải qua endpoint yêu cầu phiên và kiểm tra workspace.

## Giới hạn trước production

Đăng ký chưa xác minh email; chưa có luồng đặt lại mật khẩu và gửi mail. Thay mật khẩu cần mật khẩu hiện tại và thu hồi session cũ. Cần thêm dịch vụ email, chặn abuse đăng nhập, chính sách lưu/xóa tài khoản và quy trình backup/restore trước khi dùng cho dữ liệu thật. Một số thao tác file/database không thể nằm trong cùng transaction; cần reconciliation/dọn file mồ côi khi mở rộng.
