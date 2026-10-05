# Đề xuất: model nhận diện hoạt động + LLM cho tóm tắt ngày (làm sau)

Trạng thái: **chỉ là đề xuất**, chưa triển khai trong code.

## Mục tiêu

Tóm tắt hiện tại chỉ đọc chữ hai bạn đã viết. Muốn tóm tắt "có liên kết" hơn, hệ thống cần biết
*ai đang làm gì, ở đâu, lúc mấy giờ* — kể cả khi người đó chỉ gửi ảnh mà không viết gì.

## Luồng đề xuất

```
Ảnh / video 7s ──► (1) Model thị giác ──► nhãn có cấu trúc ──┐
                                                               ├──► (3) LLM ──► dòng thời gian + tóm tắt
Tin nhắn chữ (có thể trống) ──► (2) chuẩn hoá theo giờ ──────┘
```

1. **Model thị giác (ML/DL)** chạy một lần khi ảnh được tải lên, kết quả lưu vào bảng mới
   `MediaInsight(mediaId, scene, activity, objects[], indoor, confidence, model, createdAt)`.
   - *Cảnh quan*: model phân loại cảnh (ví dụ Places365 / CLIP zero-shot với danh sách nhãn tiếng Việt:
     "quán cà phê", "văn phòng", "bãi biển", "phòng ngủ"…).
   - *Hành động*: với ảnh dùng CLIP zero-shot ("đang ăn", "đang làm việc", "đang tập thể dục"…);
     với video 7s dùng model hành động nhẹ (ví dụ X-CLIP hoặc VideoMAE nhỏ) trên 8 khung hình.
   - Chỉ lưu nhãn + độ tin cậy, không lưu embedding khuôn mặt; bỏ nhãn dưới ngưỡng (ví dụ 0.35).
2. **Chuẩn hoá theo giờ**: mỗi tin nhắn/ảnh gắn `createdAt` theo múi giờ workspace và theo ngày 27 giờ
   (00:00 → 03:00 hôm sau), để LLM thấy một dòng thời gian liền mạch.
3. **LLM** nhận một bản ghi JSON theo thứ tự thời gian, ví dụ
   `[{ "time": "12:10", "person": "An", "scene": "quán ăn", "activity": "đang ăn", "text": "bún bò ngon quá" }]`,
   rồi trả về hai phần: dòng thời gian "ai làm gì lúc nào" và tóm tắt ngày. Prompt giữ quy tắc hiện có:
   chỉ dựa trên dữ liệu, nói rõ khi nhãn chỉ là phỏng đoán từ ảnh ("có vẻ đang ở quán cà phê").

## Vì sao làm theo cách này

- Tách model thị giác khỏi LLM: rẻ hơn (chạy một lần/ảnh thay vì gửi ảnh mỗi lần tóm tắt), dễ kiểm tra và
  thay model, và ảnh không phải rời khỏi backend nếu tự host model.
- Có thể bắt đầu bằng một LLM đa phương thức (gửi ảnh thu nhỏ kèm prompt) để thử nghiệm nhanh, rồi
  chuyển sang model riêng khi cần tiết kiệm chi phí hoặc riêng tư.

## Cần quyết định trước khi làm

- Hai người có đồng ý cho ảnh được phân tích không (nên có công tắc trong Cài đặt, mặc định tắt).
- Tự host model (cần GPU/CPU worker và hàng đợi) hay dùng API bên ngoài.
- Quota: tính chung với giới hạn 5 lần tóm tắt/ngày hiện có hay tách riêng.
