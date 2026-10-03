# Trò chuyện với nhau sau 1 ngày dài

Ứng dụng nhật ký riêng cho hai người, hỗ trợ nhiều workspace/cặp đôi trên cùng website.

## Chạy trên Windows lần đầu

Yêu cầu Node.js LTS, npm và PostgreSQL 16. Docker Compose là phương án thay thế.

```powershell
./scripts/start-local-postgres.ps1
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Mở http://localhost:3000. Backend chạy cổng 4000; PostgreSQL riêng của dự án lắng nghe loopback trên cổng 5433. Script giữ nguyên cluster khác và không xóa dữ liệu khi chạy lại. DBeaver kết nối bằng:

Để tạo workspace demo tách biệt với tài khoản thật, chạy:

```powershell
npm run db:seed:demo
```

Lệnh tạo hai tài khoản demo, 30 ngày nhật ký, một bình luận có trả lời và tóm tắt xem trước của ngày hôm qua; mật khẩu mới được in ra terminal mỗi lần chạy. Dùng tài khoản demo trong cửa sổ riêng để không thay phiên đăng nhập hiện tại. Script chỉ cho phép PostgreSQL loopback và storage local, không sửa dữ liệu workspace thật hoặc tạo ảnh giả. Chọn **Kỷ niệm** rồi mở ngày hôm qua để xem tóm tắt mẫu.

| Trường | Giá trị |
|---|---|
| Host | `localhost` |
| Port | `5433` |
| Database | `journal` |
| User | `journal` |
| Password | `journal_local_only` |
| SSL | Tắt, chỉ với PostgreSQL local |

Thông tin này chỉ dành cho database local. Không đưa thông tin local vào hosting.

## Khóa dịch vụ ngoài

Ứng dụng chạy với ảnh lưu local. Để chạy AI, điền `LLM_API_KEY`, `LLM_MODEL` và tùy chọn `LLM_BASE_URL` trong `.env`, sau đó khởi động lại backend. Khi đưa lên hosting, cần cấu hình bucket private Supabase và các biến `SUPABASE_*`, đồng thời đặt `STORAGE_DRIVER=supabase`.

Nếu không dùng Docker, có thể đặt `DATABASE_URL` trỏ đến PostgreSQL 16 hiện có. Đảm bảo tài khoản database, mật khẩu và quyền tạo bảng đã được cấp; không sửa/xóa cluster PostgreSQL đang dùng cho ứng dụng khác.

Để dùng Docker Compose, dừng PostgreSQL local của dự án trước rồi chạy `docker compose up -d postgres`. Hai lựa chọn đều dùng cổng 5433 trên máy.

Các giá trị local nằm trong `.env` và `apps/web/.env.local`, đều được Git bỏ qua. Không commit các file này. Dùng `.env.example` làm danh sách cấu hình tham khảo. WebSocket realtime mặc định dùng cùng hostname của trang với cổng `4000`, nên có thể mở trang từ điện thoại qua IP máy tính trong cùng mạng Wi-Fi. Thêm origin frontend tương ứng vào `APP_ORIGIN` trong `.env`; nếu backend production có hostname khác, đặt `NEXT_PUBLIC_BACKEND_URL` ở frontend thành URL backend công khai.

## Workspaces

Mỗi tài khoản chỉ tham gia một workspace trong bản đầu. Chủ workspace tạo link mời dùng một lần có hạn 24 giờ rồi tự gửi cho người còn lại. Mỗi workspace có tối đa hai tài khoản và dữ liệu nhật ký được truy vấn theo workspace.

## Môi trường production

Frontend dùng Vercel, backend dùng Render và PostgreSQL/Supabase Storage dùng project production riêng. Next.js chuyển tiếp `/api` đến backend để cookie phiên cùng origin. Khi frontend và backend có hostname khác nhau, đặt `NEXT_PUBLIC_BACKEND_URL` ở frontend thành URL công khai của backend để mở WebSocket trực tiếp, và đặt `APP_ORIGIN` ở backend thành origin frontend được phép. Không lưu ảnh trên ổ đĩa Render. Thiết lập backup SQL và ảnh, gửi email xác minh/khôi phục mật khẩu, tên miền và giới hạn chi phí LLM trước khi đưa dữ liệu thật vào ứng dụng.
