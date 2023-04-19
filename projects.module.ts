import { TypeOrmModule } from '@nestjs/typeorm'
import { forwardRef, Module } from '@nestjs/common'

import { ProjectSendRequest } from './entities/project-send-request.entity'
import { CompaniesModule } from 'src/modules/companies/companies.module'
import { UsersModule } from 'src/modules/users/users.module'
import { EmailModule } from 'src/modules/email/email.module'
import { MessagesModule } from '../messages/messages.module'
import { ProjectsController } from './projects.controller'
import { RequestsController } from './requests.controller'
import { AuthModule } from 'src/modules/auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { InvitesModule } from '../invites/invites.module'
import { TriggersService } from './triggers.service'
import { ProjectsService } from './projects.service'
import { RequestsService } from './requests.service'
import { Project } from './entities/project.entity'

@Module({
  imports: [
    StorageModule,
    TypeOrmModule.forFeature([Project, ProjectSendRequest]),
    forwardRef(() => AuthModule),
    UsersModule,
    CompaniesModule,
    EmailModule,
    MessagesModule,
    InvitesModule,
  ],
  controllers: [ProjectsController, RequestsController],
  providers: [TriggersService, ProjectsService, RequestsService],
  exports: [ProjectsService, TypeOrmModule],
})
export class ProjectsModule {}
