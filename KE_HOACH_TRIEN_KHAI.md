# Kế hoạch triển khai: Trò chuyện với nhau sau 1 ngày dài

Tài liệu này là checklist thực hiện, chưa phải mã nguồn ứng dụng. Đánh dấu `[x]` sau khi đã kiểm tra điều kiện hoàn thành, không chỉ sau khi tạo tài khoản dịch vụ.

## Trạng thái hiện tại — 02/10/2026

Đang ở giai đoạn **bản local có thể chạy thử**. Mã nền và các luồng chính đã được dựng; các checkpoint dưới đây vẫn chỉ được đánh dấu hoàn tất khi đạt đúng điều kiện nghiệm thu của chúng.

| Hạng mục | Trạng thái kiểm chứng |
|---|---|
| Cấu trúc monorepo FE/BE/contracts, Next.js, NestJS và Prisma | Đã có; production build thành công |
| PostgreSQL phát triển trên máy | Đã chạy riêng ở `127.0.0.1:5433`; migration đầu đã áp dụng và `prisma migrate status` báo up to date |
| Frontend/backend local | Đang chạy tại `http://localhost:3000` và `http://localhost:4000`; `/api/health` trả `ok` |
| Đăng nhập, profile, lời mời và workspace | Đã triển khai trong mã nguồn; chưa nghiệm thu bằng bốn tài khoản ở hai workspace |
| Nhật ký, ảnh, bình luận, lịch, streak và trái tim | Đã triển khai trong mã nguồn; chưa hoàn tất kiểm thử CP10–CP14 trên hai thiết bị |
| AI | Nút và backend đã có; chưa gọi được nhà cung cấp thật vì chưa cấu hình `LLM_API_KEY` và `LLM_MODEL` |
| GitHub, Supabase dev, Vercel/Render staging, email và backup production | Chưa cấu hình; các checkpoint liên quan vẫn mở |

Trong lượt tiếp tục này, việc công khai câu chuyện được hoãn đến sau khi ảnh tải thành công, avatar mới được dọn nếu cập nhật tài khoản lỗi, và yêu cầu AI được giới hạn 16.000 ký tự đầu vào cùng 900 token đầu ra. Không đánh dấu CP09–CP16 hoàn tất chỉ dựa trên việc build thành công.

## 1. Phương án chốt để triển khai

| Thành phần | Lựa chọn | Bạn cần chuẩn bị |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS | Node.js, tài khoản Vercel |
| Backend | NestJS + TypeScript | Node.js, tài khoản Render |
| Database SQL | PostgreSQL trên Supabase | Project Supabase dành cho phát triển |
| Kết nối database | Prisma | Chuỗi kết nối PostgreSQL |
| Lưu ảnh | Supabase Storage, bucket riêng tư | Bucket và khóa truy cập phía backend |
| AI | API của một nhà cung cấp LLM hỗ trợ tiếng Việt | API key và ngân sách sử dụng |
| Mã nguồn | GitHub, repository private | Git, tài khoản GitHub |
| Kiểm tra SQL | DBeaver Community | Cài ứng dụng và cấu hình kết nối |

**PostgreSQL là cơ sở dữ liệu SQL, nhưng không phải Microsoft SQL Server.** Với phương án này, bạn không cần cài SQL Server, SSMS hay Docker để bắt đầu. Nếu bắt buộc dùng Microsoft SQL Server, phải đổi phương án database, Prisma provider và hosting trước khi code; không thực hiện đồng thời hai phương án.

**Kiến trúc:** trình duyệt → Next.js → `/api` cùng tên miền → NestJS → PostgreSQL / kho ảnh / LLM. Backend chịu trách nhiệm kiểm tra đăng nhập và quyền truy cập. File ảnh nằm trong Storage; SQL lưu nội dung, thời gian và tham chiếu đến file.

Next.js sẽ chuyển tiếp các yêu cầu `/api` đến NestJS. Đây là phần cần lập trình và kiểm thử, giúp luồng cookie đăng nhập không phụ thuộc vào cookie khác miền giữa Vercel và Render.

## 2. Các mốc tổng thể

| Mốc | Các checkpoint | Kết quả |
|---|---|---|
| A — Sẵn sàng viết code | CP00–CP08 | Máy, database dev, kho ảnh, cấu hình, thiết kế và đường triển khai đã chuẩn bị |
| B — Bản khung chạy online | CP09 | FE gọi BE, BE kết nối database trên môi trường thử nghiệm |
| C — Hoàn thiện tính năng | CP10–CP14 | Hai người dùng được nhật ký, bình luận, AI và streak |
| D — Sẵn sàng dùng thật | CP15–CP16 | Môi trường production riêng, kiểm thử, sao lưu và khôi phục đạt yêu cầu |

Trình tự: `CP00 → CP01 → CP02 → CP03 → CP04 → CP05 → CP06 → CP07 → CP08 → bắt đầu code`.

Bạn có thể bắt đầu phần nhật ký khi AI chưa sẵn sàng nếu ghi rõ hoãn CP05. Tuy nhiên, không đánh dấu tính năng AI hoàn thành cho đến khi có một lần gọi API thực tế thành công.

## 3. Checklist trước khi bắt đầu code

### CP00 — Chốt quy tắc sản phẩm

**Bạn thực hiện:** đọc và xác nhận các mặc định dưới đây; ghi lại thay đổi trước khi thiết kế database.

- [ ] Website hỗ trợ nhiều cặp đôi ngay từ bản đầu; mỗi cặp có workspace riêng, tối đa hai tài khoản, dữ liệu cách ly theo mục 11.
- [ ] Hai người dùng hai tài khoản riêng, mỗi tài khoản có email, mật khẩu, phiên đăng nhập và profile cá nhân riêng; không dùng chung tài khoản.
- [ ] Mỗi người chỉnh được tên hiển thị, ảnh đại diện và giới thiệu ngắn của chính mình; người yêu xem được profile sau khi ghép đôi. Chi tiết tại mục 10.
- [ ] Một tài khoản chỉ thuộc một cặp đôi trong bản đầu.
- [ ] Mỗi người có một câu chuyện mỗi ngày, gồm nhiều đoạn văn bản và ảnh.
- [ ] Lưu nháp chỉ chủ bài xem được; đăng bài mới hiển thị cho người còn lại.
- [ ] Chủ bài có thể sửa và xóa nội dung của mình.
- [ ] Bình luận và trả lời hỗ trợ hai cấp trong giao diện: bình luận gốc và các câu trả lời.
- [ ] Múi giờ chung mặc định là `Asia/Ho_Chi_Minh`; bản đầu chưa cho đổi sau khi bắt đầu streak.
- [ ] Streak chung chỉ được tính khi cả hai có ít nhất một nội dung đã đăng hợp lệ trong cùng ngày.
- [ ] Nội dung hợp lệ là văn bản không chỉ có khoảng trắng hoặc ảnh đã tải thành công.
- [ ] Viết bù ngày cũ không khôi phục streak. Lưu riêng ngày câu chuyện và thời điểm đăng thực tế.
- [ ] Nếu xóa hết nội dung hợp lệ của ngày đã tính streak, hệ thống tính lại chuỗi liên quan.
- [ ] Trái tim đầy sau 30 ngày liên tiếp; trên 30 ngày vẫn tiếp tục đếm.
- [ ] Trong ngày hiện tại, chưa đủ bài của hai người thì hiển thị “chờ hoàn thành hôm nay”; chỉ đứt chuỗi khi ngày đó kết thúc mà vẫn thiếu bài.
- [ ] AI chỉ tóm tắt văn bản của câu chuyện đã đăng, do người dùng chủ động yêu cầu; không gửi ảnh và bình luận trong bản đầu.
- [ ] Mỗi ngày có nút “Tóm tắt ngày của hai đứa”, tổng hợp câu chuyện của cả hai trong đúng workspace và ngày đã chọn, xem được phần của từng người theo mục 12.
- [ ] Chưa làm chat trực tiếp, video, thông báo đẩy và tự đổi người yêu trong bản đầu.

**Hoàn thành khi:** không còn mâu thuẫn về ai được xem bài, thế nào là một ngày, thế nào là streak và cách xử lý xóa bài.

### CP01 — Chuẩn bị máy Windows

**Bạn thực hiện:**

- [ ] Cài Git từ https://git-scm.com/downloads.
- [ ] Cài Node.js bản LTS từ https://nodejs.org/; ghi lại phiên bản và dùng cùng phiên bản khi deploy.
- [ ] Cài VS Code hoặc dùng trình soạn thảo hiện có.
- [ ] Cài DBeaver Community từ https://dbeaver.io/download/.
- [ ] Mở PowerShell mới và chạy:

```powershell
git --version
node --version
npm --version
```

- [ ] Cả ba lệnh trả về phiên bản. Nếu PowerShell chặn `npm.ps1`, thử `npm.cmd --version` trước khi thay đổi chính sách hệ thống.
- [ ] Xác nhận thư mục dự án: `D:\Luan_document\tai_lieu_hoc_tap\TLMN`.

**Hoàn thành khi:** máy chạy được Git, Node.js, npm và mở được DBeaver. Chưa cần cài Next.js hoặc NestJS toàn cục.

### CP02 — Chuẩn bị GitHub và cách giữ bí mật

**Bạn thực hiện:**

- [ ] Tạo tài khoản GitHub nếu chưa có.
- [ ] Tạo repository **private**, ví dụ `chuyen-cuoi-ngay`.
- [ ] Kiểm tra máy có thể đăng nhập GitHub và có quyền push vào repository.
- [ ] Ghi URL repository vào bảng bàn giao ở cuối tài liệu.
- [ ] Chọn cách lưu mật khẩu database và API key: trình quản lý mật khẩu hoặc cấu hình môi trường của dịch vụ.
- [ ] Thống nhất không gửi API key/mật khẩu thật trong chat, issue hoặc tài liệu kế hoạch.

**Sẽ thực hiện ngay khi khởi tạo code:** tạo `.gitignore` để bỏ qua `.env`, `.env.local`, các biến thể môi trường chứa bí mật, `node_modules` và file build; vẫn cho phép commit `.env.example` chỉ chứa giá trị mẫu.

**Hoàn thành khi:** repository tồn tại, bạn có quyền ghi và đã có nơi cất bí mật. Không cần commit file chứa thông tin đăng nhập để kiểm tra Git.

### CP03 — Setup database SQL cho môi trường phát triển

**Bạn thực hiện trên Supabase:**

- [ ] Đăng ký tại https://supabase.com/.
- [ ] Tạo project `chuyen-cuoi-ngay-dev`.
- [ ] Chọn vùng gần người sử dụng và backend, ví dụ Singapore nếu dịch vụ hỗ trợ.
- [ ] Tạo mật khẩu database đủ mạnh và lưu trong trình quản lý mật khẩu.
- [ ] Chờ project sẵn sàng.
- [ ] Lấy thông tin PostgreSQL: host, port, database, user, password và yêu cầu SSL trong mục kết nối của project.
- [ ] Lấy chuỗi kết nối trực tiếp hoặc **session pooler** theo khả năng mạng. Nếu kết nối trực tiếp chỉ có IPv6 mà máy/hosting không dùng được, chọn session pooler hỗ trợ IPv4 theo hướng dẫn Supabase.

**Kiểm tra bằng DBeaver:**

- [ ] Tạo kết nối PostgreSQL mới với đúng thông tin dịch vụ cung cấp.
- [ ] Cấu hình SSL theo yêu cầu của dịch vụ; không tắt SSL để xử lý lỗi kết nối.
- [ ] Nhấn Test Connection và xác nhận thành công.
- [ ] Chạy SQL kiểm tra chỉ đọc:

```sql
SELECT current_database(), current_user, now();
SHOW timezone;
```

- [ ] Lưu chuỗi kết nối cho backend dưới tên cấu hình dự kiến `DATABASE_URL`.
- [ ] Ghi lại kết nối dùng cho migrations. Có thể cần biến riêng `MIGRATION_DATABASE_URL`; cách khai báo cụ thể sẽ theo phiên bản Prisma được chốt khi code.

**Lưu ý:** sao chép cấu hình từ dịch vụ; không tự đoán port hoặc tên user. Mật khẩu có ký tự đặc biệt cần được mã hóa đúng khi đưa vào URL. REST URL dạng `https://...supabase.co` không phải chuỗi kết nối PostgreSQL.

**Chưa tạo bảng nghiệp vụ bằng tay.** Khi bắt đầu code, bảng được tạo bằng Prisma migrations để có lịch sử thay đổi và tái tạo được môi trường.

**Hoàn thành khi:** DBeaver kết nối được và chạy được hai câu SQL. Tạo project thành công nhưng chưa kết nối thử thì checkpoint chưa hoàn thành.

### CP04 — Setup nơi lưu ảnh

**Bạn thực hiện trong project Supabase dev:**

- [ ] Tạo bucket tên `story-images`.
- [ ] Đặt bucket ở chế độ **private**.
- [ ] Chọn giới hạn bản đầu: JPEG, PNG, WebP; tối đa 10 MB mỗi ảnh và 10 ảnh mỗi câu chuyện.
- [ ] Cấu hình giới hạn trên bucket ở mức dịch vụ hỗ trợ; backend sẽ tiếp tục kiểm tra nội dung file và tổng số ảnh.
- [ ] Lưu Project URL, tên bucket và khóa truy cập server vào nơi giữ bí mật.
- [ ] Dùng dashboard tải một ảnh thử không nhạy cảm lên bucket.
- [ ] Xác nhận đường dẫn public thông thường không cho xem ảnh; đường dẫn ký có thời hạn mới cho truy cập.
- [ ] Xóa ảnh thử sau khi kiểm tra.

**Thiết kế cần triển khai sau:** backend xác nhận người dùng thuộc đúng cặp đôi trước khi cấp quyền tải lên hoặc URL xem ảnh. SQL chỉ lưu đường dẫn đối tượng trong bucket, không lưu URL có thời hạn. Khóa có đặc quyền của Supabase chỉ nằm phía server.

**Hoàn thành khi:** bucket riêng tư tồn tại, upload thử thành công và đã xác định được cách backend truy cập. Chính sách quyền truy cập của ứng dụng sẽ kiểm thử thêm ở CP11.

### CP05 — Chuẩn bị dịch vụ LLM

**Bạn thực hiện:**

- [ ] Chọn một nhà cung cấp có API tóm tắt tiếng Việt.
- [ ] Tạo tài khoản API và kiểm tra phương thức thanh toán/hạn mức cần thiết. Gói chat cá nhân không mặc nhiên bao gồm chi phí API.
- [ ] Tạo API key riêng cho ứng dụng.
- [ ] Ghi lại tên model và API base URL chính xác theo tài liệu của nhà cung cấp.
- [ ] Chọn ngân sách AI/tháng, ví dụ mức bạn chấp nhận là 100.000 đồng; đây là ngân sách tự đặt, không phải báo giá dịch vụ.
- [ ] Bật cảnh báo chi phí hoặc giới hạn chi tiêu nếu nhà cung cấp hỗ trợ; kiểm tra đó là cảnh báo hay giới hạn cứng.
- [ ] Thử một yêu cầu ngắn bằng công cụ chính thức của nhà cung cấp, xác nhận tài khoản/model sử dụng được.
- [ ] Thống nhất giới hạn ứng dụng: tối đa 5 yêu cầu tạo/tạo lại AI cho mỗi workspace trong một ngày sử dụng, tính chung hai thành viên và mọi ngày câu chuyện được chọn; nội dung không đổi trả bản đã lưu, không gọi AI lại.

**Hoàn thành khi:** có key hợp lệ, model xác định được và một lần gọi thử thành công. Bài dài sẽ có giới hạn đầu vào rõ ràng; không âm thầm cắt bỏ nội dung rồi coi là tóm tắt đầy đủ.

### CP06 — Chuẩn bị hướng deploy, chưa deploy ứng dụng

**Bạn thực hiện:**

- [ ] Tạo tài khoản Vercel tại https://vercel.com/.
- [ ] Tạo tài khoản Render tại https://render.com/.
- [ ] Cho phép hai dịch vụ truy cập đúng repository GitHub của dự án.
- [ ] Kiểm tra gói dịch vụ hiện tại: mức phí, có ngủ khi không sử dụng hay không, giới hạn build, lưu trữ và băng thông.
- [ ] Chọn ngân sách hosting + database + storage/tháng, tách khỏi ngân sách AI.
- [ ] Chọn dùng tên miền mặc định trước. Tên miền riêng là tùy chọn, không chặn việc bắt đầu code.
- [ ] Chọn vùng backend gần vùng database khi có thể.
- [ ] Ghi kế hoạch môi trường: local và staging dùng dữ liệu thử; production dùng project database/storage riêng khi ra mắt.

**Cấu hình triển khai dự kiến:**

| Dịch vụ | Cấu hình sẽ làm khi đã có code |
|---|---|
| Vercel | Deploy Next.js; cấu hình backend URL ở phía server; chuyển tiếp `/api` |
| Render | Deploy NestJS; bind `0.0.0.0`, đọc `PORT` do hosting cung cấp; health check `/health` |
| Supabase dev | Chứa dữ liệu thử và ảnh thử; tuyệt đối không dùng câu chuyện thật để test phá dữ liệu |
| Supabase prod | Tạo trước khi ra mắt, có database và bucket riêng |

**Không dùng ổ đĩa tạm của Render để giữ ảnh.** Ảnh phải còn sau khi restart hoặc deploy backend.

**Hoàn thành khi:** các tài khoản, quyền repository, ngân sách và phương án vùng/môi trường đã rõ. Chưa thể xác nhận deploy thành công khi chưa có code; kiểm tra đó thuộc CP09.

### CP07 — Chốt đăng nhập và bảng biến môi trường

**Phương án bản đầu:** đăng nhập bằng email + mật khẩu do backend quản lý, mật khẩu băm bằng thư viện phù hợp, phiên đăng nhập dùng cookie `HttpOnly`; production bật `Secure`. Backend kiểm tra quyền trên từng bài viết, bình luận và ảnh. Không cho frontend kết nối trực tiếp vào các bảng nghiệp vụ.

- [ ] Chốt mã mời dùng một lần, hết hạn sau 24 giờ.
- [ ] Chốt xác minh email và khôi phục mật khẩu cần có trước khi dùng thật.
- [ ] Chọn dịch vụ gửi email giao dịch hỗ trợ API hoặc SMTP; chuẩn bị quyền gửi từ địa chỉ/tên miền hợp lệ trước CP15.
- [ ] Ghi nhận môi trường dev có thể dùng email sandbox, không gửi email thật trong test.
- [ ] Dự kiến middleware chống CSRF/kiểm tra Origin cho các thao tác thay đổi dữ liệu dùng cookie, giới hạn số lần đăng nhập và kiểm soát upload.
- [ ] Điền trạng thái “đã có/chưa có” cho các cấu hình bên dưới. Không điền bí mật thật vào tài liệu này.

| Biến dự kiến | Nằm ở đâu | Nội dung |
|---|---|---|
| `DATABASE_URL` | Backend | Kết nối SQL của đúng môi trường |
| `MIGRATION_DATABASE_URL` | Tác vụ migration | Kết nối hỗ trợ migration, nếu tách riêng |
| `SUPABASE_URL` | Backend | URL project dùng cho Storage |
| `SUPABASE_SERVER_KEY` | Backend | Khóa server/secret hoặc service role phù hợp SDK; không công khai |
| `SUPABASE_STORAGE_BUCKET` | Backend | `story-images` |
| `LLM_API_KEY` | Backend | Khóa API của LLM |
| `LLM_MODEL` | Backend | Mã model chính xác |
| `LLM_BASE_URL` | Backend | Endpoint nếu SDK/nhà cung cấp cần cấu hình |
| `APP_ORIGIN` | Backend | Origin của frontend, cập nhật khi có URL staging/prod |
| `BACKEND_URL` | Next.js server | Địa chỉ NestJS để chuyển tiếp `/api` |
| Cấu hình email | Backend | Khóa API hoặc SMTP; tên biến cụ thể tùy dịch vụ |

Tên biến là quy ước dự kiến, cần thống nhất với code. Không thêm tiền tố `NEXT_PUBLIC_` vào API key, mật khẩu SQL hoặc khóa Storage. Không dùng lại bí mật dev cho production.

**Hoàn thành khi:** biết từng cấu hình lấy từ đâu và đặt ở đâu; các khóa cần cho dev đã được chuẩn bị an toàn. URL hosting và khóa production được bổ sung ở CP09/CP15.

### CP08 — Chốt thiết kế và cho phép bắt đầu code

**Bạn và người triển khai cùng thực hiện:**

- [ ] Chốt màn hình: đăng nhập, ghép đôi, trang chủ, viết câu chuyện, chi tiết bài, lịch, profile cá nhân/chỉnh sửa profile, xem profile người yêu và cài đặt.
- [ ] Áp dụng yêu cầu giao diện đã chốt: hồng–trắng, cute và ấm áp theo mục 9; duyệt mẫu trang chủ và màn hình viết câu chuyện trước khi triển khai toàn bộ FE.
- [ ] Chốt giao diện mobile trước; có trạng thái tải, trống, lỗi và tải ảnh thất bại.
- [ ] Chốt schema dự kiến: `users`, `sessions`, `couples`, `couple_members`, `invitations`, `daily_stories`, `story_entries`, `media`, `comments`, `daily_summaries`, `streak_days` và token xác minh/khôi phục tài khoản.
- [ ] Quy ước một bản ghi `couples` là một workspace; `couple_id` là khóa cách ly dữ liệu. Chốt ràng buộc, API, cache và quyền truy cập theo mục 11.
- [ ] Chốt bản tóm tắt theo workspace/ngày với nguồn của hai thành viên và phiên bản nội dung theo mục 12.
- [ ] Chốt ràng buộc: một bài/người/ngày; một cặp/tài khoản; tối đa hai thành viên/cặp; mã mời chỉ dùng một lần.
- [ ] Dữ liệu thời gian dùng UTC; ngày nghiệp vụ của câu chuyện là trường ngày riêng theo múi giờ chung.
- [ ] Chốt thao tác xóa: bài kéo theo bình luận và tham chiếu ảnh; bản tóm tắt chung có sử dụng bài đó phải bị vô hiệu hóa và ẩn ngay, sau đó tạo lại từ dữ liệu còn lại nếu người dùng yêu cầu. Có cơ chế dọn file ảnh lỗi/mồ côi.
- [ ] Chốt cấu trúc repository và trách nhiệm từng tầng theo mục 8: `apps/web`, `apps/api`, `packages/contracts`; migration nằm cùng backend; khóa phiên bản dependency bằng lockfile.
- [ ] Thống nhất quy tắc phụ thuộc: giao diện gọi API, controller gọi service, service gọi repository hoặc adapter; logic streak nằm trong domain để kiểm thử độc lập.
- [ ] Chuẩn bị bốn tài khoản thử A–B và C–D thuộc hai workspace riêng để kiểm tra phân quyền; dùng thêm tài khoản chưa ghép đôi cho ca nhận lời mời khi cần.
- [ ] Điền bảng bàn giao cuối tài liệu và kiểm tra lại các checkpoint trước đó.

**Đầu ra cần có trước khi code:** tài liệu này đã đánh dấu, sơ đồ dữ liệu được chốt, bản phác thảo các màn hình và danh sách cấu hình còn thiếu. Nếu AI/email chưa có, ghi rõ hạng mục hoãn và checkpoint phải hoàn thành trước khi ra mắt.

## 4. Các checkpoint sau khi bắt đầu code

### CP09 — Khởi tạo và deploy bản khung thật sớm

**Người triển khai thực hiện, bạn cấu hình tài khoản/biến môi trường khi cần:**

- [ ] Khởi tạo Next.js, NestJS, Prisma và `.env.example`.
- [ ] Tạo cấu trúc nền theo mục 8 và cấu hình npm workspaces; chỉ thêm module/tầng khi có chức năng sử dụng, không tạo hàng loạt thư mục rỗng.
- [ ] Cấu hình kiểm tra import để frontend không nhập code backend và domain không phụ thuộc Prisma/NestJS.
- [ ] Tạo migration đầu tiên và chạy trên database dev.
- [ ] Không mở các bảng nghiệp vụ cho Supabase Data API truy cập vô danh; kiểm tra schema/grant hoặc RLS theo cấu hình thực tế. Quyền ở NestJS không thay thế việc chặn đường truy cập SQL/REST ngoài ứng dụng.
- [ ] Chạy local: frontend cổng 3000, backend cổng 4000.
- [ ] FE gọi BE qua `/api`; backend thực hiện được truy vấn SQL.
- [ ] Deploy frontend lên Vercel và backend lên Render thành staging.
- [ ] Cấu hình đúng working directory, build command, start command theo repository thực tế.
- [ ] Cấu hình môi trường staging, health check và migrations có kiểm soát.
- [ ] Mở URL staging trên điện thoại bằng mạng di động.
- [ ] Kiểm tra HTTPS, FE → BE → SQL thành công, restart backend không làm mất dữ liệu.

**Hoàn thành khi:** đã chứng minh đường triển khai hoạt động trước khi viết nhiều tính năng.

### CP10 — Đăng nhập, ghép đôi, profile và quyền riêng tư

- [ ] Đăng ký, đăng nhập, đăng xuất và quản lý phiên chạy được.
- [ ] Cookie hoạt động trên URL staging qua `/api`, refresh trang không mất phiên bất thường.
- [ ] Tạo mã mời, nhận lời mời và chặn thành viên thứ ba.
- [ ] Tạo được nhiều workspace độc lập; A–B ở workspace 1, C–D ở workspace 2, không truy cập chéo theo mục 11.
- [ ] Xử lý hai yêu cầu nhận cùng mã mời đồng thời bằng transaction/ràng buộc phù hợp.
- [ ] Người ngoài không đọc/sửa được dữ liệu bằng cách đổi ID trong API.
- [ ] Đăng xuất làm phiên mất hiệu lực; API ghi dữ liệu có bảo vệ CSRF/Origin phù hợp.
- [ ] Mỗi tài khoản xem/sửa được profile của mình: tên hiển thị, avatar và giới thiệu ngắn theo mục 10.
- [ ] Xem được profile người yêu sau khi ghép đôi; không sửa được profile người khác bằng giao diện hoặc gọi trực tiếp API.
- [ ] Avatar mặc định, thay/xóa avatar, lỗi upload và lưu profile hoạt động đúng; ảnh riêng tư chỉ cấp URL cho người có quyền.
- [ ] Sửa profile hiển thị nhất quán trên bài viết, bình luận và khung cặp đôi sau khi làm mới dữ liệu; đăng nhập lại vẫn giữ thay đổi.

**Hoàn thành khi:** bốn tài khoản thử ở hai workspace chứng minh được cả trường hợp cho phép lẫn từ chối truy cập, bao gồm quyền chỉnh profile.

### CP11 — Câu chuyện và ảnh

- [ ] Tạo nháp, đăng, thêm đoạn mới, sửa, xóa và xem lại theo ngày.
- [ ] Ảnh được lưu ở Storage và hiển thị đúng thứ tự.
- [ ] Upload thất bại có thông báo và thử lại được; không tạo đoạn ảnh được tính streak khi chưa upload xong.
- [ ] Reload hoặc đăng nhập từ thiết bị khác vẫn thấy đúng nội dung và ảnh.
- [ ] Người ngoài không xin được URL xem/tải ảnh; URL xem ảnh có thời hạn.
- [ ] Xóa nội dung xử lý cả bản ghi và dọn file liên quan; có xử lý trường hợp một bước thất bại.

**Hoàn thành khi:** hai người kể và đọc lại một ngày hoàn chỉnh trên staging.

### CP12 — Bình luận, trả lời và lịch

- [ ] Bình luận, trả lời, sửa/xóa nội dung của chính mình.
- [ ] Không bình luận vào nháp hoặc bài ngoài cặp đôi.
- [ ] Lịch mở đúng câu chuyện của từng ngày, phân trang khi có nhiều nội dung.
- [ ] Có trạng thái cập nhật rõ ràng; bản đầu không bắt buộc WebSocket.

**Hoàn thành khi:** hai tài khoản tương tác được trên điện thoại và máy tính.

### CP13 — AI tóm tắt ngày của hai người

- [ ] Backend gọi LLM, có timeout, kiểm soát đầu vào và giới hạn số lần gọi.
- [ ] Có nút “Tóm tắt ngày của hai đứa” ở trang ngày hôm nay và chi tiết ngày cũ; hai thành viên đều dùng được.
- [ ] Chỉ thành viên đúng workspace mới tạo/xem được bản tóm tắt; dữ liệu đầu vào gồm bài đã đăng của hai người trong ngày đã chọn.
- [ ] Lưu kết quả theo workspace/ngày và phiên bản/hash toàn bộ nguồn; chỉnh sửa bài làm bản cũ được đánh dấu cần cập nhật. Xóa/thu hồi nguồn làm bản cũ bị ẩn ngay.
- [ ] Hiển thị phần của từng người, điểm chung nếu có và nhãn thiếu câu chuyện khi chỉ một người đã đăng; không tự suy đoán nội dung người còn lại.
- [ ] Hai người bấm cùng lúc không tạo hai lời gọi AI trùng; không dùng lại cache của workspace khác.
- [ ] AI lỗi/hết hạn mức không ảnh hưởng việc đăng bài.
- [ ] Nội dung tóm tắt chỉ dựa trên bài đã đăng; không tự tạo thêm sự kiện.
- [ ] Không ghi API key hoặc toàn bộ câu chuyện riêng tư vào log mặc định.

**Hoàn thành khi:** kiểm tra thành công và thất bại của API bằng bài tiếng Việt thực tế.

### CP14 — Streak và trái tim

- [ ] Tính streak từ dữ liệu ngày hợp lệ trên server, không tin ngày giờ thiết bị người dùng.
- [ ] Một người đăng chưa tăng chuỗi; hai người đăng cùng ngày chỉ tăng một lần.
- [ ] Test các mốc trước/sau 00:00 theo múi giờ chung.
- [ ] Test bỏ ngày, viết bù, sửa, xóa bài, gửi yêu cầu lặp và đăng đồng thời.
- [ ] Trong ngày chưa kết thúc vẫn giữ chuỗi trước đó ở trạng thái chờ hoàn thành.
- [ ] Hiển thị streak hiện tại, kỷ lục và mức đầy trái tim ở 0/1/7/15/30/31 ngày.
- [ ] Sau nhiều ngày không mở web, lần mở tiếp theo vẫn tính đúng; không phụ thuộc vào việc trình duyệt phải mở lúc nửa đêm.

**Hoàn thành khi:** các ca biên có kiểm thử tự động và kết quả hiển thị khớp dữ liệu server.

## 5. Checkpoint đưa vào sử dụng thật

### CP15 — Chuẩn bị production

**Bạn thực hiện cùng người triển khai:**

- [ ] Tạo project Supabase production riêng; bucket private riêng, mật khẩu và API key riêng.
- [ ] Tách deployment staging và production; preview deployment không được dùng database production.
- [ ] Thiết lập biến môi trường production trên Vercel/Render, kiểm tra không có `localhost` hoặc khóa dev.
- [ ] Chạy migration đã kiểm tra; không dùng reset database hoặc lệnh đồng bộ schema tùy tiện trên dữ liệu thật.
- [ ] Hoàn thiện xác minh email và khôi phục mật khẩu; kiểm tra thư thực sự đến hộp thư của hai người.
- [ ] Nếu dùng tên miền riêng, cấu hình DNS và HTTPS theo hướng dẫn hosting; cập nhật `APP_ORIGIN` và đường dẫn email.
- [ ] Chốt sao lưu SQL hằng ngày và sao lưu/copy ảnh theo khả năng dịch vụ và gói đã chọn.
- [ ] Kiểm tra backup SQL có bao gồm file Storage hay không; không mặc định metadata ảnh đồng nghĩa đã sao lưu file ảnh.
- [ ] Thử khôi phục một bộ dữ liệu mẫu cùng ảnh sang môi trường riêng, xác nhận truy cập lại được.
- [ ] Cấu hình cảnh báo lỗi, dung lượng, chi phí và quy trình quay về bản code trước khi deploy lỗi.
- [ ] Với migration thay đổi dữ liệu, có phương án tương thích/khôi phục riêng; rollback code không tự hoàn tác database.

**Hoàn thành khi:** production tách biệt môi trường thử và đã chứng minh dữ liệu có thể phục hồi.

### CP16 — Nghiệm thu bằng hai điện thoại

- [ ] Hai người tạo tài khoản thật, xác minh email và ghép đôi.
- [ ] Hai người đặt tên, đổi avatar và giới thiệu riêng; xem được profile của nhau, không chỉnh được của người kia.
- [ ] Mỗi người đăng một câu chuyện và ảnh, xem được nội dung của nhau.
- [ ] Bình luận và trả lời đúng bài; tóm tắt AI hiển thị đúng.
- [ ] Ngày đầu tiên đủ điều kiện hiển thị streak 1 và trái tim tương ứng.
- [ ] Đăng xuất/đăng nhập lại vẫn còn đủ dữ liệu.
- [ ] Tài khoản thử ngoài cặp không truy cập được bài và ảnh.
- [ ] Hai cặp đôi thử nghiệm có workspace riêng; mã mời, lịch, profile, ảnh, bình luận, streak và tóm tắt AI không bị lẫn.
- [ ] Restart/deploy backend không làm mất ảnh hoặc câu chuyện.
- [ ] Kiểm tra cả màn hình nhỏ, ảnh lớn, mạng chậm và lỗi dịch vụ AI.
- [ ] Ghi URL sử dụng, người quản lý tài khoản dịch vụ và cách xử lý khi có lỗi.

**Hoàn thành khi:** toàn bộ luồng sử dụng chính chạy trên production với dữ liệu thật và các kiểm tra quyền truy cập đạt yêu cầu.

## 6. Bảng bàn giao trước khi bắt đầu code

Chỉ ghi định danh công khai và trạng thái. Mật khẩu, key và chuỗi kết nối chứa mật khẩu nằm trong nơi quản lý bí mật.

| Thông tin | Giá trị/trạng thái bạn điền |
|---|---|
| Đã chốt quy tắc CP00 | Chưa / Rồi; các thay đổi: ... |
| Phiên bản Node.js / npm / Git | ... |
| GitHub repository URL | ... |
| Tên project Supabase dev / vùng | ... |
| DBeaver kết nối SQL thành công | Chưa / Rồi |
| Bucket private và upload thử | Chưa / Rồi |
| Chuỗi SQL và khóa Storage đã cất an toàn | Chưa / Rồi |
| Nhà cung cấp LLM / mã model | ... |
| LLM gọi thử thành công | Chưa / Rồi / Hoãn đến CP13 |
| Vercel / Render được cấp quyền repository | Chưa / Rồi |
| Dịch vụ email dự kiến | ... |
| Tên miền | Dùng tên mặc định / Tên riêng: ... |
| Ngân sách hạ tầng/tháng | ... đồng |
| Ngân sách AI/tháng | ... đồng |
| Ai chịu trách nhiệm tài khoản và thanh toán | ... |
| Các mục đang thiếu và thời hạn hoàn thành | ... |

## 7. Lịch thực hiện gợi ý

- Buổi 1: CP00–CP02 — chốt tính năng, cài công cụ, tạo repository.
- Buổi 2: CP03–CP04 — tạo SQL, kết nối bằng DBeaver, thử kho ảnh.
- Buổi 3: CP05–CP08 — chuẩn bị AI, tài khoản deploy, cấu hình và thiết kế.
- Tuần 1 sau khi bắt đầu code: CP09–CP10 — deploy bản khung, đăng nhập, ghép đôi và profile.
- Tuần 2: CP11–CP12 — câu chuyện, ảnh, bình luận và lịch.
- Tuần 3: CP13–CP14 — AI, streak và trái tim.
- Tuần 4–5 nếu cần: CP15–CP16 — production, email, sao lưu, kiểm thử và sửa lỗi.

Đây là lịch ước lượng cho một người triển khai. Phí dịch vụ, hạn mức, khả năng backup và thời gian xác minh tài khoản phải kiểm tra tại thời điểm đăng ký; tài liệu không giả định một gói miễn phí sẽ đáp ứng production.

## 8. Cấu trúc thư mục và phân tầng khi code

### 8.1. Nguyên tắc tổ chức

Chia theo **ứng dụng → tính năng → tầng xử lý**. Ví dụ, toàn bộ phần backend của câu chuyện nằm trong `modules/stories`; bên trong mới chia controller, service và repository. Khi sửa tính năng câu chuyện, không phải tìm trong nhiều thư mục lớn chứa lẫn tất cả tính năng.

Backend là một ứng dụng NestJS có nhiều module, dùng chung một database. Bản đầu chưa cần microservice. Đây là cấu trúc dự kiến để triển khai; chưa phải các thư mục mã nguồn đã được tạo.

### 8.2. Cây thư mục tổng thể

```text
TLMN/
├── apps/
│   ├── web/                              # Frontend Next.js
│   │   ├── src/
│   │   │   ├── app/                      # Route, layout, loading, error
│   │   │   │   ├── (auth)/               # Đăng nhập, đăng ký, khôi phục mật khẩu
│   │   │   │   ├── (main)/               # Trang chủ, câu chuyện, lịch, profile, cài đặt
│   │   │   │   └── api/[...path]/        # Chuyển tiếp /api đến NestJS
│   │   │   ├── features/                # Giao diện và thao tác theo tính năng
│   │   │   │   ├── auth/
│   │   │   │   ├── couples/             # Tạo workspace, mời và tham gia
│   │   │   │   ├── profile/              # Xem/sửa hồ sơ, chọn avatar
│   │   │   │   ├── stories/
│   │   │   │   │   ├── components/       # StoryEditor, StoryCard, PhotoGallery
│   │   │   │   │   ├── hooks/            # Đọc/làm mới dữ liệu và trạng thái form
│   │   │   │   │   └── api.ts           # Các lời gọi API câu chuyện
│   │   │   │   ├── comments/
│   │   │   │   ├── summaries/
│   │   │   │   └── streaks/
│   │   │   ├── components/              # Thành phần dùng chung
│   │   │   │   ├── ui/                  # Button, Input, Dialog
│   │   │   │   └── layout/              # Header, Navigation
│   │   │   ├── lib/                     # HTTP client, định dạng ngày, cấu hình FE
│   │   │   └── styles/                  # Màu sắc, font, CSS chung
│   │   ├── public/                      # Icon, ảnh tĩnh; không chứa ảnh người dùng
│   │   ├── tests/e2e/                   # Kiểm thử luồng trình duyệt
│   │   ├── .env.example
│   │   └── package.json
│   └── api/                              # Backend NestJS
│       ├── src/
│       │   ├── main.ts                  # Khởi động server
│       │   ├── app.module.ts            # Đăng ký module của ứng dụng
│       │   ├── config/                  # Đọc và kiểm tra biến môi trường
│       │   ├── common/                  # Exception filter, decorator, tiện ích chung
│       │   ├── infrastructure/          # Kết nối công nghệ/dịch vụ bên ngoài
│       │   │   ├── database/            # Prisma client và hỗ trợ transaction
│       │   │   ├── storage/             # Adapter Supabase Storage
│       │   │   ├── llm/                 # Adapter API LLM
│       │   │   └── email/               # Adapter gửi email
│       │   └── modules/
│       │       ├── auth/                # Phiên đăng nhập, guard, token khôi phục
│       │       ├── users/                # Xem/sửa profile, quyền và dữ liệu cá nhân
│       │       ├── couples/             # Workspace, mã mời, thành viên, cách ly dữ liệu
│       │       ├── stories/
│       │       │   ├── dto/             # Dữ liệu đầu vào và validation
│       │       │   ├── domain/          # Quy tắc thuần về câu chuyện nếu cần
│       │       │   ├── stories.controller.ts
│       │       │   ├── stories.service.ts
│       │       │   ├── stories.repository.ts
│       │       │   └── stories.module.ts
│       │       ├── media/               # Quyền truy cập, upload, dọn ảnh
│       │       ├── comments/
│       │       ├── summaries/           # Tóm tắt chung theo workspace/ngày, quota/cache
│       │       ├── streaks/             # domain/ chứa phép tính chuỗi và tiến độ
│       │       └── health/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/             # Lịch sử thay đổi database
│       │   └── seed.ts                 # Dữ liệu mẫu, chỉ chạy có chủ đích
│       ├── test/
│       │   ├── integration/            # Truy vấn, transaction, ràng buộc SQL
│       │   └── e2e/                    # API, đăng nhập, phân quyền
│       ├── .env.example
│       └── package.json
├── packages/
│   └── contracts/                       # Kiểu request/response công khai cho FE/BE
├── docs/
│   ├── architecture.md                 # Sơ đồ dữ liệu, quy tắc, quyết định kỹ thuật
│   ├── local-setup.md                  # Cài và chạy trên máy mới
│   ├── deployment.md                   # Deploy staging/prod và biến môi trường
│   └── operations.md                   # Backup, restore, theo dõi lỗi, rollback
├── .github/workflows/                  # Kiểm tra lint, type, test, build
├── .gitignore
├── package.json                        # npm workspaces và lệnh chạy toàn dự án
├── package-lock.json                   # Một lockfile chung
└── KE_HOACH_TRIEN_KHAI.md
```

Các file test đơn vị như `streak-calculator.spec.ts` đặt cạnh phần logic được kiểm tra. Không bắt buộc mỗi module đều có đủ DTO/domain/repository nếu chức năng chưa cần; `health` có thể rất nhỏ.

### 8.3. Trách nhiệm từng tầng

| Tầng | Được làm | Không đặt tại đây |
|---|---|---|
| FE — `app` | Ghép màn hình, routing, layout, trạng thái tải/lỗi | SQL, API key, quy tắc quyết định streak |
| FE — `features/*/components` | Hiển thị dữ liệu và nhận thao tác người dùng | Gọi SDK LLM/Storage bằng khóa server |
| FE — `features/*/hooks` và `api.ts` | Quản lý trạng thái, gọi API, cập nhật giao diện | Quyết định quyền truy cập cuối cùng |
| BE — controller + DTO | Nhận HTTP, xác thực cấu trúc đầu vào, gọi service, trả response | Truy vấn SQL, tính streak, prompt AI |
| BE — service | Kiểm tra quyền tài nguyên, điều phối nghiệp vụ, transaction và adapter | Chi tiết giao thức HTTP của nhà cung cấp LLM/Storage |
| BE — domain | Quy tắc thuần: ngày hợp lệ, chuỗi liên tiếp, tiến độ trái tim | Request HTTP, NestJS, Prisma, SDK bên ngoài |
| BE — repository | Truy vấn và ánh xạ dữ liệu SQL của module qua Prisma | Gửi email, gọi AI, quyết định quyền người dùng |
| BE — infrastructure | Kết nối Prisma và triển khai các adapter Storage/LLM/email | Quyết định ai được đọc câu chuyện hoặc được tính streak |
| Shared — contracts | Hợp đồng request/response dùng chung, không chứa dữ liệu bí mật | Prisma model, SDK server, mật khẩu băm, session token nội bộ |

Frontend có thể kiểm tra form để phản hồi nhanh, nhưng backend phải kiểm tra lại dữ liệu và quyền. Guard xác định người đang đăng nhập; service kiểm tra họ có quyền với câu chuyện/cặp đôi cụ thể hay không.

### 8.4. Quy tắc phụ thuộc giữa các tầng và module

```text
Trang / component → hook hoặc API client → /api của Next.js
                                           ↓
                                  Controller + DTO (NestJS)
                                           ↓
                                        Service
                                  ↙        ↓        ↘
                               Domain  Repository  Adapter
                                           ↓        ↓
                                         SQL    Storage / LLM / Email
```

- `apps/web` và `apps/api` có thể dùng `packages/contracts`; hai ứng dụng không import trực tiếp mã nguồn của nhau.
- `contracts` độc lập với framework và database. Kiểu TypeScript không thay thế validation lúc chạy; backend vẫn kiểm tra request bằng DTO/schema.
- Domain nhận dữ liệu đầu vào và trả kết quả, không tự lấy thời gian hệ thống hoặc truy vấn database. Service truyền thời điểm vào để kiểm thử mốc nửa đêm dễ dàng.
- Controller không gọi Prisma hoặc SDK bên ngoài. Service gọi repository và adapter được NestJS inject; chưa cần dựng lớp abstract/interface cho mọi thao tác CRUD đơn giản.
- Module cần dữ liệu của module khác gọi service được export của module đó; không truy cập trực tiếp repository riêng của module khác.
- Tránh phụ thuộc vòng: `stories` có thể gọi dịch vụ tính lại của `streaks`, nhưng `streaks` không gọi ngược `stories`. Truyền dữ liệu ngày hợp lệ vào phần tính streak. Lập sơ đồ phụ thuộc trước khi thêm liên kết mới.
- Thao tác SQL cần nguyên tử, ví dụ đăng bài kèm cập nhật ngày đủ điều kiện, được service điều phối trong cùng transaction. Không giữ transaction SQL mở trong khi chờ upload ảnh hoặc gọi LLM.
- File upload và lời gọi AI không thể rollback như SQL; service phải có trạng thái chờ/lỗi, thử lại và dọn dữ liệu thừa khi cần.
- `common` chỉ chứa thứ dùng chung thực sự, không trở thành nơi gom logic câu chuyện, bình luận và streak.
- Proxy `/api` chỉ chuyển tiếp tới backend đã cấu hình, không nhận URL đích tùy ý từ người dùng. Kiểm tra cookie, CSRF/Origin, timeout và giới hạn upload ở CP09–CP11.

### 8.5. Tìm đúng nơi sửa khi có yêu cầu hoặc lỗi

| Việc cần sửa | Bắt đầu từ đâu |
|---|---|
| Đổi màu/hình dáng trái tim | `apps/web/src/features/streaks/components/` |
| Streak tăng sai hoặc sai khi qua nửa đêm | `apps/api/src/modules/streaks/domain/` và test đi kèm |
| Form đăng bài không gửi được dữ liệu | `apps/web/src/features/stories/api.ts`, proxy rồi controller |
| Bài viết lưu sai ngày | `stories.service.ts`, quy tắc múi giờ, sau đó repository |
| Truy vấn danh sách câu chuyện chậm | `stories.repository.ts`, index trong schema và migration |
| Người ngoài xem được bài | Guard đăng nhập và kiểm tra quyền trong service của module liên quan |
| Ảnh upload thất bại | `modules/media/` rồi `infrastructure/storage/` |
| Sửa tên, avatar hoặc giới thiệu cá nhân | FE `features/profile/`; BE `modules/users/` và `modules/media/` |
| Muốn đổi nhà cung cấp AI | `infrastructure/llm/` và cấu hình; giữ hợp đồng đầu ra ổn định |
| Muốn đổi nội dung bản tóm tắt | `modules/summaries/` và prompt/template của tính năng |
| Muốn thêm trường cảm xúc vào câu chuyện | Prisma migration → repository/service/DTO → contracts → form FE |
| Website lỗi sau khi deploy | Health check, cấu hình môi trường và `docs/deployment.md` |

### 8.6. Checklist áp dụng cấu trúc

- [ ] CP08: duyệt cây thư mục, trách nhiệm từng tầng và các luồng phụ thuộc.
- [ ] CP09: khởi tạo npm workspaces, cấu hình alias/import và build chung với `contracts`.
- [ ] CP09: build frontend/backend trên hosting có đọc được workspace package; không chỉ kiểm tra chạy local.
- [ ] Mỗi tính năng: xác định contract → migration nếu cần → repository → domain/service → controller → FE.
- [ ] Với logic quan trọng, viết test hành vi cho quyền truy cập, transaction, quy tắc ngày và streak; không tạo test chỉ để khớp hình thức chia folder.
- [ ] Trước khi hoàn thành tính năng: kiểm tra không có SQL trong controller, không có SDK server trong frontend và không có khóa bí mật trong contracts.
- [ ] Cập nhật tài liệu setup/deploy khi thêm biến môi trường hoặc thay đổi cách chạy.

**Điều kiện hoàn thành phần kiến trúc:** có thể chỉ rõ một thay đổi thuộc tính năng nào, tầng nào; build được hai ứng dụng độc lập và thay adapter bên ngoài mà không phải viết lại giao diện hoặc quy tắc nghiệp vụ.

## 9. Phong cách giao diện đã chốt: hồng–trắng và cute

Đây là yêu cầu của người dùng, áp dụng cho toàn bộ website. Cảm giác mong muốn: một góc nhật ký riêng ấm áp của hai người, nhẹ nhàng, đáng yêu và dễ đọc trên điện thoại.

### 9.1. Bảng màu và chữ

| Vai trò | Màu đề xuất | Cách dùng |
|---|---|---|
| Nền trang | `#FFF7FA` | Trắng pha hồng rất nhẹ |
| Nền thẻ | `#FFFFFF` | Câu chuyện, trình soạn thảo, bình luận |
| Nền nhấn | `#FCE7F3` | Khung streak, nhãn ngày, vùng chờ |
| Hồng trang trí | `#F472B6` | Trái tim, icon, họa tiết; không dùng làm chữ nhỏ trên nền trắng |
| Nút chính | `#BE185D` | Nút đăng bài/lưu, kết hợp chữ trắng |
| Viền nhẹ | `#FBCFE8` | Viền thẻ và đường phân cách trang trí |
| Chữ chính | `#4A2535` | Nội dung câu chuyện và tiêu đề |
| Chữ phụ | `#795563` | Thời gian, mô tả; kiểm tra độ tương phản trên nền thực tế |

- Font đề xuất: **Be Vietnam Pro**, có đầy đủ dấu tiếng Việt; fallback `system-ui, sans-serif`.
- Nội dung trên điện thoại mặc định khoảng 16 px, giãn dòng 1,6–1,75; không dùng font viết tay cho cả bài dài.
- Màu được khai báo bằng CSS variables/design tokens trong `apps/web/src/styles/`, ánh xạ sang Tailwind để thay đồng bộ.
- Không dùng màu hồng làm tín hiệu duy nhất: trạng thái lỗi, thành công và streak luôn có chữ hoặc icon đi kèm.

### 9.2. Thành phần tạo cảm giác dễ thương

- Thẻ trắng bo góc khoảng 20–24 px, viền hồng nhẹ, đổ bóng mềm và khoảng cách thoáng.
- Avatar tròn; có thể đặt hai avatar cạnh nhau với một trái tim nhỏ ở giữa.
- Trái tim streak là điểm nhấn trên trang chủ, tô hồng dần từ dưới lên theo tiến độ và có số ngày rõ ràng.
- Dùng icon nét bo tròn nhất quán: trái tim, bông hoa, máy ảnh, phong thư, mặt trăng và ngôi sao nhỏ.
- Họa tiết trang trí đặt ở mép thẻ hoặc vùng trống, không đè lên đoạn văn, nút và ảnh.
- Ảnh giữ đúng tỉ lệ; thumbnail có thể crop nhưng khi mở ảnh phải xem được đầy đủ.
- Ngày có đủ câu chuyện của hai người trên lịch được đánh dấu bằng trái tim nhỏ, kèm trạng thái bằng chữ khi chọn ngày.
- Hiệu ứng nút và thẻ khoảng 150–250 ms; trái tim nảy nhẹ khi hoàn thành ngày, chúc mừng ngắn khi đạt mốc.
- Tôn trọng `prefers-reduced-motion`, tránh nhấp nháy và không để hoạt ảnh trang trí chạy liên tục khi đọc bài.

### 9.3. Bố cục trang chủ dự kiến

```text
┌─────────────────────────────────────────┐
│ Trò chuyện với nhau sau 1 ngày dài       │
│ Một góc nhỏ để mình lắng nghe nhau       │
│                                         │
│       [Avatar]  ♡  [Avatar]              │
│       [Trái tim hồng đang đầy dần]       │
│       7 ngày bên nhau · Mục tiêu 30      │
│                                         │
│ [Hôm nay của bạn thế nào?             ] │
│ [Viết câu chuyện]                       │
│                                         │
│ Câu chuyện hôm nay                      │
│ [Thẻ trắng: lời kể + ảnh + bình luận]   │
│ [Thẻ trắng: lời kể của người còn lại]   │
│                                         │
│ Trang chủ    Lịch kỷ niệm    Cài đặt     │
└─────────────────────────────────────────┘
```

Trên desktop có thể đặt khung streak/lịch ở cột bên và bảng tin ở cột chính. Trên điện thoại xếp thành một cột, tránh cuộn ngang; thanh điều hướng không che nội dung hoặc bàn phím khi nhập bài.

### 9.4. Lời nhắn trong giao diện

- Ô nhập: “Hôm nay của bạn thế nào?”
- Chưa có câu chuyện: “Một ngày mới, một câu chuyện mới đang chờ bạn kể.”
- Đang chờ người còn lại: “Góc nhỏ hôm nay đang chờ câu chuyện của người ấy.”
- Đủ streak trong ngày: “Thêm một ngày mình lắng nghe nhau 💗”
- Bỏ lỡ một ngày: “Hôm nay mình cùng bắt đầu lại nhé.”
- Nút AI: “Tóm tắt ngày của hai đứa”; có mô tả ngắn để người dùng biết AI sử dụng những câu chuyện đã đăng của hai người trong ngày đang xem.

Giọng văn thân mật, không trách móc khi mất streak; lỗi hệ thống vẫn ghi rõ nguyên nhân có thể xử lý và nút thử lại.

### 9.5. Checkpoint kiểm tra giao diện

- [ ] CP08: duyệt bản mẫu trang chủ và màn hình viết bài ở kích thước điện thoại theo bảng màu này.
- [ ] CP09: tạo tokens và thành phần dùng chung: Button, Input, Card, Avatar, Dialog, trạng thái trống/lỗi/tải.
- [ ] CP11–CP12: câu chuyện dài, ảnh và bình luận nhiều vẫn thoáng, không bị họa tiết che nội dung.
- [ ] CP14: trái tim ở 0/7/15/30 ngày nhìn thấy khác biệt và có số ngày để đọc tiến độ.
- [ ] CP16: kiểm tra ở chiều rộng 360 px, 390 px và desktop; nút tương tác trên điện thoại có vùng chạm khoảng 44 × 44 px trở lên.
- [ ] CP16: kiểm tra tương phản tối thiểu WCAG AA, focus bàn phím rõ, label cho form và chế độ giảm chuyển động.

**Điều kiện hoàn thành:** toàn bộ màn hình nhất quán hồng–trắng, cute, đọc được bài dài và thao tác thuận tiện trên điện thoại; không chỉ trang chủ có trang trí đúng phong cách.

## 10. Hai tài khoản riêng và profile cá nhân

### 10.1. Phạm vi chức năng

Mỗi người đăng ký và đăng nhập bằng tài khoản riêng, sau đó ghép đôi bằng mã mời. Profile gắn với tài khoản, còn không gian chia sẻ gắn với cặp đôi. Người dùng chưa ghép đôi vẫn chỉnh được hồ sơ của mình.

| Thông tin | Có thể chỉnh? | Quy tắc bản đầu |
|---|---|---|
| Tên hiển thị | Có | Bắt buộc, 1–50 ký tự sau khi bỏ khoảng trắng đầu/cuối |
| Ảnh đại diện | Có | Một ảnh JPEG/PNG/WebP, tối đa 5 MB; thay hoặc xóa về avatar mặc định |
| Giới thiệu ngắn | Có | Không bắt buộc, tối đa 200 ký tự, văn bản thuần |
| Email đăng nhập | Chỉ xem trong trang cá nhân của chính mình | Không trả về trong profile người yêu; đổi email chưa thuộc bản đầu |
| Mật khẩu | Quản lý riêng trong bảo mật tài khoản | Đổi mật khẩu yêu cầu mật khẩu hiện tại; quên mật khẩu dùng luồng khôi phục qua email |
| Người đang ghép đôi | Chỉ xem | Không sửa trực tiếp từ form profile |

Đổi mật khẩu thuộc module `auth`, không đi qua API cập nhật profile. Sau khi đổi/khôi phục mật khẩu thành công, thu hồi các phiên cũ và yêu cầu đăng nhập lại. Không bao giờ trả mật khẩu băm hoặc dữ liệu phiên trong response profile.

### 10.2. Màn hình và quyền truy cập

- Trang **Hồ sơ của tôi**: avatar lớn, tên, giới thiệu và nút “Chỉnh sửa hồ sơ”, giữ phong cách hồng–trắng của mục 9.
- Form chỉnh sửa có xem trước avatar, giới hạn file, nút lưu/hủy và thông báo lưu thành công/thất bại.
- Trang **Hồ sơ người ấy**: xem tên, avatar, giới thiệu; không có thao tác chỉnh sửa hoặc thông tin đăng nhập.
- Bấm avatar/tên trên câu chuyện hoặc bình luận để mở đúng profile.
- Chỉ chủ tài khoản và người đang ghép đôi được xem profile; tài khoản ngoài cặp không lấy được thông tin qua API hoặc xin URL avatar.
- Backend lấy ID người cần cập nhật từ phiên đăng nhập, không tin `userId` do form gửi. Chỉ cho phép các trường tên, giới thiệu và avatar hợp lệ; chặn việc sửa vai trò, email hoặc cặp đôi bằng cách thêm trường vào request.

### 10.3. Dữ liệu và API dự kiến

- Bảng `users` bổ sung `display_name`, `bio`, `avatar_media_id`, `updated_at`; không cần một bảng profile riêng khi chưa có nhu cầu tách biệt.
- Bảng `media` phân biệt mục đích `avatar` và `story`, lưu chủ sở hữu. Avatar không được tính vào ảnh câu chuyện hoặc streak.
- Có thể dùng chung bucket private `story-images` với tiền tố đối tượng `avatars/<user-id>/...` và `stories/<story-id>/...`; tên đường dẫn không thay thế kiểm tra quyền.
- `GET /users/me`: lấy hồ sơ của chính mình; `PATCH /users/me`: cập nhật các trường cho phép.
- `GET /users/:id/profile`: xem hồ sơ công khai trong phạm vi cặp đôi, chỉ trả tên, avatar và giới thiệu sau khi kiểm tra quyền.
- Luồng upload qua module `media` tạo bản ghi avatar hợp lệ trước; khi cập nhật hồ sơ, backend xác nhận ảnh thuộc đúng tài khoản và có đúng mục đích.
- Chỉ thay tham chiếu avatar khi upload và cập nhật SQL thành công; dọn avatar cũ/file mồ côi sau đó. Upload thất bại giữ avatar đang dùng.
- Tên/avatar trên bài và bình luận đọc từ người viết hiện tại, không sao chép cứng vào từng bài; thay đổi profile không sửa nội dung câu chuyện.

### 10.4. Checkpoint nghiệm thu profile

- [ ] CP08: duyệt schema và hai màn hình xem/sửa profile; chuẩn bị avatar mặc định dễ thương.
- [ ] CP10: tài khoản A và B đổi tên/avatar/giới thiệu độc lập, không ghi đè dữ liệu của nhau.
- [ ] CP10: A xem được hồ sơ B sau khi ghép đôi, nhưng sửa hồ sơ B bị từ chối; tài khoản C ngoài cặp không xem được.
- [ ] CP10: kiểm tra tên trống/quá dài, file sai định dạng/quá lớn, ảnh của tài khoản khác, lưu thất bại và xóa avatar.
- [ ] CP10: kiểm tra đổi mật khẩu và thu hồi phiên; phần email thật của luồng khôi phục được xác nhận tại CP15.
- [ ] CP16: thay đổi profile còn nguyên sau khi đăng xuất/đăng nhập và hiển thị đúng trên cả hai thiết bị.

**Điều kiện hoàn thành:** hai người có danh tính, thông tin cá nhân và quyền chỉnh sửa độc lập; chỉ chia sẻ các thông tin profile đã xác định với người đang ghép đôi.

## 11. Kết nối tài khoản và workspace riêng cho mỗi cặp đôi

### 11.1. Phạm vi đã chốt

Ứng dụng phục vụ nhiều cặp đôi ngay từ thiết kế ban đầu. Mỗi cặp có một workspace gồm hai tài khoản, có tên riêng, nhật ký, ảnh, lịch, bình luận, streak và bản tóm tắt riêng. Không phải triển khai một website hoặc database mới cho mỗi cặp.

Trong bản đầu, mỗi tài khoản thuộc tối đa một workspace; mỗi workspace chứa tối đa hai thành viên. Việc hỗ trợ nhiều cặp đôi không đồng nghĩa một tài khoản tham gia nhiều cặp. Chuyển cặp/rời workspace/xử lý dữ liệu sau chia tay cần quy tắc riêng và chưa nằm trong bản đầu.

Ví dụ: workspace “Góc nhỏ của An & Bình” có An và Bình; workspace “Nhật ký của Chi & Dũng” có Chi và Dũng. Bốn người dùng cùng website nhưng chỉ đọc và tương tác trong workspace của mình.

### 11.2. Luồng tạo và kết nối

1. Người A đăng ký, xác minh email và chỉnh profile.
2. Khi chưa có workspace, giao diện có hai lựa chọn: **“Tạo góc nhỏ của hai đứa”** hoặc **“Tham gia bằng lời mời”**. Không tự tạo workspace ngay khi đăng ký, để người được mời có thể tham gia.
3. A tạo workspace, nhập tên; A là thành viên đầu tiên. Hệ thống tạo mã/link mời dùng một lần, hết hạn sau 24 giờ.
4. A sao chép và tự gửi link/mã cho B.
5. B đăng nhập tài khoản riêng, mở lời mời, xem thông tin xác nhận tối thiểu rồi bấm **“Kết nối”**.
6. Backend kiểm tra token, thời hạn, số thành viên và B chưa thuộc workspace khác; thêm B và đánh dấu lời mời đã dùng trong một transaction.
7. Cả hai vào cùng workspace. Ngày bắt đầu đủ hai thành viên là ngày sớm nhất có thể tính streak chung.

- A có thể hủy hoặc tạo lại lời mời khi workspace còn một người; tạo lại làm lời mời cũ mất hiệu lực.
- Hai yêu cầu nhận lời mời đồng thời không được làm xuất hiện thành viên thứ ba hoặc một người ở hai workspace.
- Lưu hash token mời, không log token; giới hạn số lần nhập sai. Không đưa câu chuyện riêng tư vào màn hình xem trước lời mời.
- Không tự động gửi email/tin nhắn mời thay người dùng; giao diện có nút sao chép link/mã.
- Khi chưa có người thứ hai, chủ workspace vẫn viết câu chuyện được; giao diện nhắc mời người ấy và chưa bắt đầu streak chung.

### 11.3. Thiết kế dữ liệu và cách ly workspace

Giữ tên kỹ thuật `couples` và `couple_id` đã dùng trong kế hoạch. Trên giao diện gọi là “Góc nhỏ” hoặc workspace; không tạo thêm bảng `workspaces` trùng chức năng.

| Dữ liệu | Cách gắn workspace |
|---|---|
| `couples` | `id`, tên workspace, người tạo, múi giờ, mục tiêu streak, ngày đủ hai thành viên |
| `couple_members` | `couple_id`, `user_id`, vị trí thành viên 1/2, thời gian tham gia |
| `invitations` | `couple_id`, hash token, người tạo, hạn dùng, trạng thái |
| `daily_stories` | `couple_id`, tác giả, ngày câu chuyện; unique theo workspace/tác giả/ngày |
| `story_entries`, `comments`, ảnh câu chuyện | Thuộc bài viết; mọi truy vấn kiểm tra workspace thông qua bài hoặc khóa ngoại phù hợp |
| Avatar | Thuộc tài khoản; quyền xem dựa trên chính chủ hoặc cùng workspace |
| `daily_summaries` | `couple_id`, ngày câu chuyện, phiên bản nguồn và kết quả AI |
| `streak_days` | Unique theo `couple_id` và ngày hợp lệ |

- Ràng buộc SQL: `couple_members.user_id` unique trong bản đầu; vị trí thành viên chỉ nhận 1 hoặc 2 và unique theo workspace/vị trí, kết hợp transaction để giới hạn hai người.
- Backend xác định thành viên từ phiên đăng nhập; không coi `couple_id` do frontend gửi là bằng chứng có quyền.
- Repository đọc/sửa/xóa dữ liệu workspace phải nhận phạm vi workspace đã xác thực. Tra cứu trực tiếp bằng ID bài, bình luận hoặc file cũng phải kiểm tra cùng phạm vi.
- Khi liên kết bình luận, ảnh hoặc đoạn chia sẻ vào một bài, xác nhận bài đích thuộc đúng workspace; có ràng buộc khóa ngoại nhất quán nếu lưu lặp khóa workspace ở bảng con.
- Cache, quota, khóa chống gọi AI trùng và truy vấn lịch đều có `couple_id`; không dùng ngày hoặc ID người dùng đơn lẻ làm khóa cho dữ liệu chung.
- URL ảnh có thời hạn chỉ được cấp sau khi kiểm tra quyền; đường dẫn chứa ID workspace không tự tạo ra bảo mật.
- Bản đầu không có màn hình cho người dùng duyệt danh sách mọi workspace; không công khai hồ sơ/câu chuyện của các cặp khác.

### 11.4. API dự kiến và checkpoint

- `POST /couples`: tạo workspace khi chưa là thành viên của workspace nào.
- `GET /couples/me`: lấy workspace hiện tại và hai thành viên, hoặc trạng thái chưa kết nối.
- `PATCH /couples/me`: cập nhật tên workspace; không cho sửa danh sách thành viên hay múi giờ tùy tiện.
- `POST /couples/me/invitations`: tạo/thay lời mời khi còn chỗ.
- `DELETE /couples/me/invitations/current`: thu hồi lời mời hiện tại.
- `POST /couples/invitations/accept`: nhận token trong request body, xác nhận tham gia.

- [ ] CP08: chốt schema workspace, ràng buộc hai thành viên và giao diện tạo/tham gia.
- [ ] CP10: thử tạo A–B và C–D; mỗi nhóm nhìn thấy đúng workspace của mình.
- [ ] CP10: thử lời mời hết hạn, bị hủy, đã dùng, người đã có workspace và hai người nhận cùng lúc.
- [ ] CP11–CP14: kiểm tra quyền với từng loại dữ liệu, gồm đường dẫn ảnh và cache AI.
- [ ] CP16: A/B không đọc/sửa/xóa được dữ liệu C/D kể cả khi biết ID hoặc thay tham số API.

**Điều kiện hoàn thành:** nhiều cặp đôi đăng ký và kết nối độc lập trên cùng hệ thống mà dữ liệu không bị lẫn hoặc lộ giữa các workspace.

## 12. Nút AI “Tóm tắt ngày của hai đứa”

### 12.1. Cách sử dụng

Ở trang hôm nay và trang xem lại một ngày trong lịch, hiển thị nút **“Tóm tắt ngày của hai đứa”**. Vào cuối ngày, một trong hai người bấm nút; AI đọc các đoạn văn bản đã đăng của cả hai trong đúng ngày đó và lưu một bản tóm tắt chung để hai người cùng xem.

Không bắt buộc chờ qua 00:00: trước khi ngày kết thúc, bản tóm tắt ghi “Tính đến HH:mm”. Với ngày cũ, dùng nội dung của ngày được chọn theo múi giờ workspace. Nếu sau đó có thêm câu chuyện, giao diện báo “Có chia sẻ mới” và cho tạo lại theo hạn mức.

### 12.2. Nội dung bản tóm tắt

1. **Ngày của [tên người A]:** sự kiện và cảm xúc đã được người đó thể hiện trong lời kể.
2. **Ngày của [tên người B]:** nội dung tương tự từ câu chuyện của B.
3. **Điều đáng nhớ của hai đứa:** điểm chung hoặc sự kiện liên quan được nhắc đến; nếu không có thì tóm lược hai ngày riêng, không tự bịa một hoạt động chung.

Ví dụ khi dữ liệu nguồn có các sự kiện tương ứng:

> **Ngày của An:** Buổi sáng bận xử lý công việc, buổi chiều thấy nhẹ nhõm vì hoàn thành sớm.
>
> **Ngày của Bình:** Có một buổi học dài và cảm thấy vui khi được bạn giúp làm bài.
>
> **Điều đáng nhớ:** Cả hai đều trải qua một ngày bận rộn và có những việc khiến mình vui hơn.

Kết quả dùng giọng văn ấm áp, ngắn gọn, giữ đúng người kể. Không đánh giá tình cảm, chẩn đoán tâm lý hoặc coi nội dung nhật ký là chỉ dẫn để thay đổi nhiệm vụ của AI.

### 12.3. Trường hợp đặc biệt và lưu dữ liệu

- Chưa ai có văn bản đã đăng: nút bị vô hiệu hóa, giải thích cần chia sẻ bằng chữ để tóm tắt; không gọi API tính phí.
- Chỉ một người đã kể: có thể tóm tắt phần đang có và ghi rõ “Chưa có câu chuyện bằng chữ của [tên]”; không giả lập nội dung người còn lại.
- Chỉ có ảnh: ảnh vẫn tính điều kiện chia sẻ/streak, nhưng không được AI phân tích trong bản đầu.
- Có nháp hoặc bình luận: không đưa vào dữ liệu tóm tắt, kể cả khi người bấm nút là chủ nháp.
- AI nhận nguồn được phân tách bằng ID/tên người kể, ngày và thứ tự thời gian; chỉ dùng dữ liệu của workspace đã xác thực.
- Lưu `couple_id`, ngày được tóm tắt, hash/phiên bản tổng nguồn, thời gian tạo, model, phiên bản prompt và kết quả. Có thể lưu phần của từng người bằng cấu trúc JSON đã kiểm tra, không lưu toàn bộ bản sao câu chuyện chỉ để làm cache.
- Hai người bấm cùng lúc: dùng khóa/trạng thái xử lý theo workspace/ngày/phiên bản nguồn để chỉ gọi một lần và chia sẻ kết quả.
- Khi xử lý xong, kiểm tra nguồn còn đúng phiên bản và còn quyền hiển thị trước khi công bố; nguồn bị sửa/xóa trong lúc AI chạy không được làm bản cũ xuất hiện lại.
- Khi bài bị xóa/thu hồi, ẩn và vô hiệu hóa bản tóm tắt có chứa nội dung đó; không giữ bản lịch sử hiển thị tiếp cho người dùng.
- Hạn mức mặc định: 5 yêu cầu tạo/tạo lại/workspace/ngày sử dụng, tính theo múi giờ workspace và áp dụng cho cả các ngày cũ. Dùng cache không tiêu tốn lượt; hai người dùng chung hạn mức.
- AI lỗi hoặc quá hạn mức: thông báo rõ, giữ nguyên bài gốc và cho thử lại khi phù hợp. Bấm tóm tắt không làm tăng streak.

### 12.4. API và nghiệm thu

- `GET /couples/me/days/:date/summary`: xem kết quả chung và trạng thái còn mới/cần cập nhật/đang xử lý.
- `POST /couples/me/days/:date/summary`: yêu cầu tạo hoặc cập nhật từ nguồn hiện tại; backend kiểm tra thành viên, ngày, quota và phiên bản nguồn.
- Workspace lấy từ phiên/thành viên ở backend. Route chứa `me` không có nghĩa chỉ tóm tắt người đang đăng nhập; đây là workspace của họ.

- [ ] CP13: cả A và B đều tạo/xem được bản tóm tắt gồm đúng hai phần và đúng ngày.
- [ ] CP13: kiểm tra thiếu một người, chỉ có ảnh, không có nội dung, bài nháp và AI thất bại.
- [ ] CP13: kiểm tra hai người bấm đồng thời, hết quota, chỉnh sửa/xóa nguồn trong lúc xử lý và cache của hai workspace cùng ngày.
- [ ] CP16: ngày cũ và hôm nay đều dùng được trên hai điện thoại, kết quả được lưu sau khi đăng nhập lại.

**Điều kiện hoàn thành:** sau một ngày, hai người bấm nút để xem lại ngày của nhau bằng AI trong cùng một bản tóm tắt; kết quả đúng phạm vi workspace, đúng ngày và không trộn lẫn người kể.
