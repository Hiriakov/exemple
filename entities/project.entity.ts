import { Column, CreateDateColumn, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm'
import { ApiProperty } from '@nestjs/swagger'

import { Category } from 'src/modules/categories/entities/category.entity'
import { ZipCode } from 'src/modules/zip-codes/entities/zip-code.entity'
import { ProjectProgress } from 'src/common/enums/project-progress.enum'
import { Company } from 'src/modules/companies/entities/company.entity'
import { ProjectStatus } from 'src/common/enums/project-status.enum'
import { desiredStartDate } from 'src/common/enums/start-date.enum'
import { Review } from 'src/modules/reviews/entities/review.entity'
import { Qoute } from 'src/modules/qoutes/entities/qoute.entity'
import { Event } from 'src/modules/events/entities/event.entity'
import { clientTypes } from 'src/common/enums/client-type.enum'
import { User } from 'src/modules/users/entities/user.entity'
import { StorageUrlTransformer } from 'src/common/transforms'
import { File } from 'src/common/interfaces/file.interface'
import { EProjectFields, ProjectTable } from '../enums'
import { ColumnType } from 'src/common/constants'

@Entity({ name: ProjectTable })
export class Project {
  @ApiProperty({
    example: '17493a7c-f40d-4c47-8139-cd9c483e4584',
    description: 'Unique identificator',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ApiProperty({
    example: '2022-01-19 18:32:57.663661',
    description: 'Project creation date',
  })
  @CreateDateColumn()
  createdAt: Date

  @ApiProperty({
    example: 'Kitchen renovation',
    description: 'Project name',
  })
  @Column({
    type: ColumnType.Varchar,
    name: EProjectFields.name,
    default: null,
  })
  name: string

  @ApiProperty({
    example: 'PLANNING | READY | RUNNING',
    description: 'What stage the project is at',
  })
  @Column({
    type: ColumnType.Enum,
    name: EProjectFields.status,
    enum: ProjectStatus,
    nullable: true,
  })
  status: ProjectStatus

  @ApiProperty({
    example: 'This is my best kitchen plan!',
    description: 'Project description',
  })
  @Column({
    type: ColumnType.Text,
    name: EProjectFields.description,
    nullable: true,
  })
  description: string

  @ApiProperty({
    example: 'photo_2021-12-16_17-47-42-e458.jpg',
    description: 'Files uploaded by the user',
  })
  @Column({
    type: ColumnType.JSONB,
    name: EProjectFields.files,
    default: [],
    transformer: new StorageUrlTransformer(),
  })
  files: File[]

  @ApiProperty({
    example: 'CREATED | QUOTA_CHOSEN | ACTIVE | FINISHED',
    description: 'Project progres',
  })
  @Column({
    type: ColumnType.Enum,
    name: EProjectFields.progress,
    enum: ProjectProgress,
    default: 'CREATED',
  })
  progress: ProjectProgress

  @ApiProperty({
    example: '2022-11-02 20:55',
    description: 'Project finish date',
  })
  @Column({
    type: ColumnType.TimeStamp,
    name: EProjectFields.finishedAt,
    nullable: true,
  })
  finishedAt: Date

  @ApiProperty({
    example: 'ONE_MONTH',
    description: 'When customer can start project',
  })
  @Column({
    type: ColumnType.Enum,
    name: EProjectFields.desiredStartDate,
    enum: desiredStartDate,
    nullable: true,
  })
  desiredStartDate: desiredStartDate

  @Column({
    type: ColumnType.Boolean,
    name: EProjectFields.isCompanyConfirmedFinish,
    default: false,
  })
  isCompanyConfirmedFinish: boolean

  @Column({
    type: ColumnType.Boolean,
    name: EProjectFields.isCustomerConfirmedFinish,
    default: false,
  })
  isCustomerConfirmedFinish: boolean

  @ApiProperty({
    example: 'HOME_OWNER',
    description: 'Property owner',
  })
  @Column({
    type: ColumnType.Enum,
    name: EProjectFields.clientType,
    enum: clientTypes,
    nullable: true,
  })
  clientType: clientTypes

  @ApiProperty({
    example: '2022-04-21 13:09',
    description: 'Project start date',
  })
  @Column({
    type: ColumnType.TimeStamp,
    name: EProjectFields.startedAt,
    nullable: true,
  })
  startedAt: Date

  /* relations */

  @ApiProperty({
    example: '0180',
    description: 'Zip code of region',
  })
  @ManyToOne(() => ZipCode, (zipCode) => zipCode.projects)
  zipCode: ZipCode

  @ManyToOne(() => User, (user) => user.projects)
  user: User

  @ManyToOne(() => Company, (company) => company.projects)
  company: Company

  @ManyToOne(() => Category, (category) => category.projects)
  category: Category

  @ApiProperty()
  @OneToMany(() => Qoute, (qoute) => qoute.project)
  qoutes: Qoute[]

  @OneToMany(() => Event, (event) => event.project)
  events: Event[]

  @OneToOne(() => Review, (review) => review.project)
  review: Review

  @ManyToMany(() => Company, (company) => company.blacklist)
  @JoinTable()
  rejected: Company[]

  @ManyToMany(() => Company, (company) => company.interestedProject)
  interestedCompany: Company[]
}
