import { ProjectProgress } from '../../../common/enums/project-progress.enum'

export class PropsProjectDto {
  progress?: ProjectProgress
  notProgress?: ProjectProgress
  search?: string
  category?: string
  sort?: string
  sortDirection?: 'ASC' | 'DESC'
}
