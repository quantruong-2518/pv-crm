import { Module } from '@nestjs/common'
import { TouchModule } from '../touch/touch.module'
import { MeetingRepository } from './meeting.repository'
import { MeetingService } from './meeting.service'

/** Sổ cuộc họp — facility của nhánh Sales, không phải module màn.
 *
 *  KHÔNG có controller, cùng lý do với `TouchModule`: bốn đường của nó sống
 *  trên `LeadController` dưới `/sales/leads/:code/meetings`, nơi trục phạm vi
 *  đã có mặt trên chính đường dẫn. Một `@Controller('sales/meetings')` sẽ phải
 *  đọc dữ liệu rồi mới biết cắt theo phạm vi của ai, tức quyền được quyết định
 *  sau khi đã đọc — đúng thứ tự ngược.
 *
 *  `imports: [TouchModule]` vì ghi một buổi họp là ghi kèm một dòng thời gian,
 *  và `exports` chỉ có service: `LeadModule` được hỏi "ghi giúp tôi một buổi
 *  họp", không được với thẳng vào hai bảng. */
@Module({
  imports: [TouchModule],
  providers: [MeetingService, MeetingRepository],
  exports: [MeetingService],
})
export class MeetingModule {}
