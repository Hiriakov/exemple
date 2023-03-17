import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Param,
	ParseIntPipe,
	ParseUUIDPipe,
	Patch,
	Post,
	Query,
	Req,
	UploadedFiles,
	UseGuards,
	UseInterceptors,
} from "@nestjs/common";
import { I18n, I18nContext } from "nestjs-i18n";
import { Pagination } from "nestjs-typeorm-paginate";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { ProjectCreationGuard } from "src/common/guards/project-creation.guard";
import { RequestWithUser } from "src/common/interfaces/reqWithUser.interface";
import { CompaniesService } from "src/modules/companies/companies.service";
import { ProjectProgress } from "src/common/enums/project-progress.enum";
import { SuperAdminGuard } from "src/common/guards/super-admin.guard";
import { Qoute } from "src/modules/qoutes/entities/qoute.entity";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { StorageService } from "../storage/storage.service";
import { UserRole } from "src/common/enums/user-role.enum";
import { PropsProjectDto } from "./dto/props-project.dto";
import { AuthGuard } from "src/common/guards/auth.guard";
import { fileFilter } from "src/utils/file-upload.utils";
import { EStorageFolder } from "../storage/storage.enum";
import { ProjectsService } from "./projects.service";
import { TriggersService } from "./triggers.service";
import { Project } from "./entities/project.entity";

@ApiTags("Projects")
@Controller("projects")
export class ProjectsController {
	constructor(
		private readonly projectsService: ProjectsService,
		private readonly companiesService: CompaniesService,
		private readonly triggersService: TriggersService,
		private readonly storageService: StorageService
	) {}

	@Post()
	@UseGuards(ProjectCreationGuard)
	@ApiOperation({ summary: "Create project" })
	@ApiResponse({ status: 201, type: Project })
	@UseInterceptors(FilesInterceptor("files", 10, { fileFilter }))
	async create(
		@Body() createProjectDto: CreateProjectDto,
		@UploadedFiles() files: Express.Multer.File[],
		@Req() req: RequestWithUser,
		@I18n() i18n: I18nContext
	): Promise<Project> {
		const filesUrls = [];
		if (files) {
			for (const file of files) {
				const fileResult = await this.storageService.uploadFile(EStorageFolder.PROJECTS, file);
				const link = this.storageService.getLink(`${fileResult.folder}/${fileResult.name}`);
				filesUrls.push({
					path: link,
					name: file.fieldname,
					originalName: file.originalname,
					type: file.mimetype,
				});
			}
		}

		createProjectDto.files = filesUrls;

		if (req.user?.role === UserRole.COMPANY_MEMBER || req.user?.role === UserRole.COMPANY_ADMIN) {
			throw new HttpException(i18n.t("projects.base.action-is-forbidden"), HttpStatus.FORBIDDEN);
		}

		if (req.user?.id) {
			createProjectDto.user = req.user.id;
		}

		const project = await this.projectsService.create(createProjectDto);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-create"), HttpStatus.BAD_REQUEST);
		}

		await this.triggersService.newProject(project.id);

		return project;
	}

	@Post(":id/start")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Start project" })
	@ApiResponse({ status: 201, type: Project })
	async startProject(@Param("id") id: string, @Req() req: RequestWithUser, @I18n() i18n: I18nContext): Promise<Project> {
		const companyId = await this.projectsService.findCompanyByUserId(req.user?.id);
		const companyAdmin = await this.companiesService.findCompanyAdmin(companyId);
		if (req.user?.role === UserRole.SUPER_ADMIN || (req.user?.role === UserRole.COMPANY_ADMIN && companyAdmin?.id === req.user?.id)) {
			const project = await this.projectsService.startProject(id);
			if (!project) {
				throw new HttpException(i18n.t("projects.base.project-not-started"), HttpStatus.NOT_FOUND);
			}
			return project;
		}
		throw new HttpException(i18n.t("projects.base.action-is-forbidden"), HttpStatus.FORBIDDEN);
	}

	@Post(":id/finish")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Finish project" })
	@ApiResponse({ status: 201, type: Project })
	async finishProject(@Param("id") id: string, @Req() req: RequestWithUser, @I18n() i18n: I18nContext): Promise<Project> {
		const user = await this.projectsService.findUserByProjectId(id);
		if (req.user?.id !== user.id) {
			throw new HttpException(i18n.t("projects.base.action-is-forbidden"), HttpStatus.FORBIDDEN);
		}
		const project = await this.projectsService.finishProject(id);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-started"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Get(":id/timeline")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get timeline" })
	@ApiResponse({ status: 200 })
	async getTimeline(@Param("id") id: string, @I18n() i18n: I18nContext) {
		const timeline = await this.projectsService.findTimeline(id);
		if (!timeline) {
			throw new HttpException(i18n.t("projects.base.timeline-not-started"), HttpStatus.NOT_FOUND);
		}
		return timeline;
	}

	@Get()
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get all projects" })
	@ApiResponse({ status: 200, type: [Project] })
	async findProjectsByUserId(
		@Req() req: RequestWithUser,
		@Query() query: PropsProjectDto,
		@Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
		@Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
		@I18n() i18n: I18nContext
	): Promise<Pagination<Project>> {
		let projects;

		if (req.user?.role === UserRole.SUPER_ADMIN) {
			projects = await this.projectsService.findAll(
				{
					page,
					limit,
				},
				query
			);
		}

		if (req.user?.role === UserRole.CUSTOMER) {
			projects = await this.projectsService.findProjectsByUserId(
				req.user?.id,
				{
					page,
					limit,
				},
				query
			);
		}

		if (req.user?.role === UserRole.COMPANY_MEMBER || req.user?.role === UserRole.COMPANY_ADMIN) {
			const companyId = await this.projectsService.findCompanyByUserId(req.user?.id);

			if (companyId) {
				projects = await this.projectsService.findProjectsByCompanyId(
					companyId,
					{
						page,
						limit,
					},
					query
				);
			}
		}

		if (projects) {
			return projects;
		}

		throw new HttpException(i18n.t("projects.base.bad-request"), HttpStatus.BAD_REQUEST);
	}

	@Get("finished")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get finished projects" })
	@ApiResponse({ status: 200, type: [Project] })
	async findProjectsFinished(
		@Req() req: RequestWithUser,
		@Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
		@Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20
	): Promise<Pagination<Project>> {
		if (req.user?.role === UserRole.CUSTOMER) {
			return this.projectsService.findProjectsByUserId(
				req.user?.id,
				{
					page,
					limit,
				},
				{
					progress: ProjectProgress.FINISHED,
				}
			);
		}
	}

	@Get(":projectId")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get one project" })
	@ApiResponse({ status: 200, type: Project })
	async findOne(@Param("projectId", ParseUUIDPipe) projectId: string, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.getProjectById(projectId);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-found"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Get(":id/full")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get one project with events" })
	@ApiResponse({ status: 200, type: Project })
	async findOneFull(@Param("id") id: string, @Req() req: RequestWithUser, @I18n() i18n: I18nContext): Promise<Project> {
		let project;
		if (req.user?.role === UserRole.COMPANY_MEMBER || req.user?.role === UserRole.COMPANY_ADMIN) {
			const companyId = await this.projectsService.findCompanyByUserId(req.user?.id);
			if (!companyId) {
				throw new HttpException(i18n.t("projects.base.company-not-found"), HttpStatus.NOT_FOUND);
			}
			project = await this.projectsService.findOne(id, companyId, true);
		} else {
			project = await this.projectsService.findOne(id, null, true);
		}

		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-found"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Get(":id/quotes")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Get quotes by project id" })
	@ApiResponse({ status: 200, type: [Qoute] })
	async getQuotesByProjectId(@Param("id") id: string, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.findProjectWithQuotas(id);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.quotes-not-found"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Patch(":id/mark-as-moderated")
	@UseGuards(SuperAdminGuard)
	@ApiOperation({
		summary: "SuperAdminGuard. Update one project to moderated progress status",
	})
	@ApiResponse({ status: 200, type: Project })
	async setModerated(@Param("id") id: string, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.update(id, {
			progress: ProjectProgress.MODERATED,
		});
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-updated"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Patch(":id")
	@UseGuards(SuperAdminGuard)
	@ApiOperation({ summary: "SuperAdminGuard. Update one project" })
	@ApiResponse({ status: 200, type: Project })
	async update(@Param("id") id: string, @Body() updateProjectDto: UpdateProjectDto, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.update(id, updateProjectDto);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-updated"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Patch(":id/set-customer")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "SuperAdminGuard. Update one project" })
	@ApiResponse({ status: 200, type: Project })
	async setCustomer(@Req() req: RequestWithUser, @Param("id") id: string, @Body("user") user: string, @I18n() i18n: I18nContext): Promise<Project> {
		if (req.user?.role !== UserRole.CUSTOMER) {
			throw new HttpException(i18n.t("projects.set-customer.login-as-customer-for-adding-project"), HttpStatus.UNAUTHORIZED);
		}

		const projectForChanging = await this.projectsService.findOne(id);
		if (projectForChanging.user) {
			throw new HttpException(i18n.t("projects.set-customer.project-already-has-client"), HttpStatus.UNAUTHORIZED);
		}

		const project = await this.projectsService.update(id, {
			user,
		});
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-updated"), HttpStatus.NOT_FOUND);
		}
		return project;
	}

	@Delete(":id")
	@UseGuards(SuperAdminGuard)
	@ApiOperation({ summary: "SuperAdminGuard. Delete one project" })
	@ApiResponse({ status: 200 })
	async remove(@Param("id") id: string, @I18n() i18n: I18nContext): Promise<void> {
		const project = await this.projectsService.findOne(id);
		if (!project) {
			throw new HttpException(i18n.t("projects.base.project-not-deleted"), HttpStatus.NOT_FOUND);
		}
		return this.projectsService.remove(id);
	}

	@Get(":id/available-companies")
	@UseGuards(SuperAdminGuard)
	@ApiOperation({ summary: "SuperAdminGuard. Delete one project" })
	async getAvailableCompanies(
		@Param("id") id: string,
		@Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
		@Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
		@I18n() i18n: I18nContext,
		@Query("search") search?: string
	) {
		const companies = await this.projectsService.findCompanyForProject(id, { page, limit }, { search });
		if (!companies) {
			throw new HttpException(i18n.t("projects.base.companies-not-found"), HttpStatus.NOT_FOUND);
		}
		return companies;
	}

	@Patch(":id/finish-company")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Confirm the end of the project by the company" })
	@ApiResponse({ status: 200, type: Project })
	async finishCompany(@Param("id") id: string, @Req() req: RequestWithUser, @Body() updateProjectDto: UpdateProjectDto, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.update(id, updateProjectDto);
		if (project.isCustomerConfirmedFinish === true) {
			await this.projectsService.update(id, {
				progress: ProjectProgress.FINISHED,
				finishedAt: new Date(Date.now()),
			});
		}
		if (!project) {
			throw new HttpException(i18n.t("projects.finish-company.project-not-finished-by-company"), HttpStatus.NOT_FOUND);
		}

		await this.triggersService.finishCompany(id, req.user.id);

		return project;
	}

	@Patch(":id/finish-customer")
	@UseGuards(AuthGuard)
	@ApiOperation({ summary: "Confirm the end of the project by the customer" })
	@ApiResponse({ status: 200, type: Project })
	async finishCustomer(@Param("id") id: string, @Req() req: RequestWithUser, @Body() updateProjectDto: UpdateProjectDto, @I18n() i18n: I18nContext): Promise<Project> {
		const project = await this.projectsService.update(id, updateProjectDto);
		if (project.isCompanyConfirmedFinish === true) {
			await this.projectsService.update(id, {
				progress: ProjectProgress.FINISHED,
				finishedAt: new Date(Date.now()),
			});
		}
		if (!project) {
			throw new HttpException(i18n.t("projects.finish.project-not-finished-by-customer"), HttpStatus.NOT_FOUND);
		}

		await this.triggersService.finishCustomer(id, req.user.id);

		return project;
	}

	@Get(":projectId/quotes")
	@UseGuards(AuthGuard, SuperAdminGuard)
	@ApiOperation({ summary: "Confirm the end of the project by the customer" })
	@ApiResponse({ status: 200, type: Project })
	async getProjectQuotes(@Param("projectId", ParseUUIDPipe) projectId: string) {
		return await this.projectsService.getProjectQuotes(projectId);
	}
}
