import { ProjectProgress } from '../../../common/enums/project-progress.enum';
import { PropsProjectDto } from './props-project.dto';

export class FindByUserProjectDto extends PropsProjectDto {
  progress?: ProjectProgress;
}
