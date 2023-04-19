import { ApiProperty } from '@nestjs/swagger'

import { Category } from 'src/modules/categories/entities/category.entity'
import { ZipCode } from 'src/modules/zip-codes/entities/zip-code.entity'
import { ProjectStatus } from 'src/common/enums/project-status.enum'
import { desiredStartDate } from 'src/common/enums/start-date.enum'
import { clientTypes } from 'src/common/enums/client-type.enum'
import { File } from 'src/common/interfaces/file.interface'

export class CreateProjectDto {
  @ApiProperty({
    example: 'Kitchen renovation',
    description: 'Project name',
  })
  name: string

  @ApiProperty({
    example: 'PLANNING | READY | RUNNING',
    description: 'What stage the project is at',
  })
  status?: ProjectStatus

  @ApiProperty({
    example: '17493a7c-f40d-4c47-8139-cd9c483e4584',
    description: 'Category ID',
  })
  categoryID: Category

  @ApiProperty({
    example: '0180',
    description: 'Zip code of region',
  })
  zipCode: ZipCode

  @ApiProperty({
    example: 'This is my best kitchen plan!',
    description: 'Project description',
  })
  description: string

  @ApiProperty({
    example: '[]',
    description: 'Files uploaded by the user',
  })
  files?: File[]

  @ApiProperty({
    example: '17493a7c-f40d-4c47-8139-cd9c483e4584',
    description: 'User ID',
  })
  user?: any

  @ApiProperty({
    example: 'ONE_MONTH',
    description: 'When customer can start project',
  })
  desiredStartDate: desiredStartDate

  @ApiProperty({
    example: 'HOME_OWNER',
    description: 'Property owner',
  })
  clientType: clientTypes
}
