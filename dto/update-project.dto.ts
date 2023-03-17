import { PartialType } from '@nestjs/swagger';
import { ProjectProgress } from 'src/common/enums/project-progress.enum';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  company?: any;
  startedAt?: Date;
  finishedAt?: Date;
  progress?: ProjectProgress;
  isCompanyConfirmedFinish?: boolean;
  isCustomerConfirmedFinish?: boolean;
}
