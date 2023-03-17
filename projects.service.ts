import { InjectRepository } from "@nestjs/typeorm";
import { getRepository, Repository } from "typeorm";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { IPaginationOptions, paginate, Pagination } from "nestjs-typeorm-paginate";

import { ZipCode } from "src/modules/zip-codes/entities/zip-code.entity";
import { ProjectProgress } from "src/common/enums/project-progress.enum";
import { Company } from "src/modules/companies/entities/company.entity";
import { FindByUserProjectDto } from "./dto/find-by-user-project.dto";
import { User } from "src/modules/users/entities/user.entity";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { PropsProjectDto } from "./dto/props-project.dto";
import { Qoute } from "../qoutes/entities/qoute.entity";
import { ELanguages, UserRole } from "src/common/enums";
import { Project } from "./entities/project.entity";
import { AppLogger } from "src/common/loggers";

@Injectable()
export class ProjectsService {
	private logger = new AppLogger(ProjectsService.name);

	constructor(@InjectRepository(Project) private projectsService: Repository<Project>) {}

	async create(createProjectDto: CreateProjectDto): Promise<Project> {
		try {
			return await this.projectsService.save(createProjectDto);
		} catch (error) {
			this.logger.error("create", error);
		}
	}

	async findAll(options: IPaginationOptions, props?: PropsProjectDto): Promise<Pagination<Project>> {
		try {
			const queryBuilder = this.projectsService.createQueryBuilder("project");

			queryBuilder.orderBy("project.createdAt", "DESC").leftJoinAndSelect("project.user", "user").leftJoinAndSelect("project.category", "category");

			if (props?.search) {
				queryBuilder.where(
					`
          (project.name ILIKE :searchQuery
          OR user.name ILIKE :searchQuery
          OR user.surname ILIKE :searchQuery
          OR category.name ILIKE :searchQuery)
        `,
					{
						searchQuery: `%${props.search}%`,
					}
				);
			}

			if (props?.progress) {
				queryBuilder.andWhere("project.progress = :progress", {
					progress: props.progress,
				});
			}

			if (props?.category) {
				queryBuilder.andWhere("category.id = :category", {
					category: props.category,
				});
			}

			if (props?.sort) {
				let sortPath = `project.${props.sort}`;

				switch (props?.sort) {
					case "category":
						sortPath = "category.name";
						break;
					case "user":
						sortPath = "user.name";
						break;
				}

				queryBuilder.orderBy(sortPath, props.sortDirection);
			} else {
				queryBuilder.orderBy("project.createdAt", "DESC");
			}

			return await paginate<Project>(queryBuilder, options);
		} catch (error) {
			this.logger.error("findAll", error);
		}
	}

	async findProjectsByUserId(id: string, options: IPaginationOptions, props?: FindByUserProjectDto): Promise<Pagination<Project>> {
		try {
			const queryBuilder = this.projectsService.createQueryBuilder("project");
			queryBuilder.where("project.user.id = :id", { id });

			if (props?.progress) {
				queryBuilder.andWhere("project.progress = :progress", {
					progress: props.progress,
				});

				if (props?.progress === ProjectProgress.FINISHED) {
					queryBuilder.leftJoinAndSelect("project.review", "review");
				}
			}

			if (props?.notProgress) {
				queryBuilder.andWhere("project.progress != :progress", {
					progress: props.notProgress,
				});
			}

			if (props?.search) {
				queryBuilder.andWhere("project.name ILIKE :searchQuery", {
					searchQuery: `%${props.search}%`,
				});
			}

			queryBuilder.orderBy("project.createdAt", "DESC");

			return await paginate<Project>(queryBuilder, options);
		} catch (error) {
			this.logger.error("findProjectsByUserId", error);
		}
	}

	async findProjectsByCompanyId(id: string, options: IPaginationOptions, props: PropsProjectDto): Promise<Pagination<Project>> {
		try {
			const queryBuilder = getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.qoutes", "qoute")
				.leftJoinAndSelect("qoute.company", "company")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.leftJoinAndSelect("zipCode.city", "city")
				.where("qoute.isAccepted = :isAccepted", { isAccepted: true })
				.andWhere("company.id = :id", { id })
				.select(["project.id", "project.name", "project.createdAt", "project.progress", "project.status", "zipCode", "city"])
				.orderBy("project.createdAt", "DESC");

			if (props?.search) {
				queryBuilder.andWhere("project.name ILIKE :searchQuery", {
					searchQuery: `%${props.search}%`,
				});
			}

			return await paginate<Project>(queryBuilder, options);
		} catch (error) {
			this.logger.error("findProjectsByCompanyId", error);
		}
	}

	async findCompanyAllRequests(categories: string[]): Promise<Project[]> {
		try {
			if (categories.length === 0) {
				throw new HttpException("Company has no category", HttpStatus.BAD_REQUEST);
			}
			return await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.category", "category")
				.where("category.id IN (:...categories)", { categories })
				.orderBy("project.createdAt", "DESC")
				.getMany();
		} catch (error) {
			this.logger.error("findCompanyAllRequests", error);
		}
	}

	async findCompanyByUserId(userId: string): Promise<string> {
		const user = await getRepository(User).createQueryBuilder("user").leftJoinAndSelect("user.company", "company").where("user.id = :userId", { userId }).getOne();

		return user?.company?.id;
	}

	async findCompanyById(projectId: string): Promise<Company> {
		const project = await getRepository(Project)
			.createQueryBuilder("project")
			.leftJoinAndSelect("project.company", "company")
			.leftJoinAndSelect("company.members", "members")
			.where("project.id = :projectId", { projectId })
			.getOne();
		return project?.company;
	}

	async findCompanyFilteredRequests(
		categories: string[],
		userId: string,
		showAnswered: boolean,
		options: IPaginationOptions,
		interestedData: { use: boolean; interested: boolean } = {
			use: false,
			interested: true,
		}
	): Promise<Pagination<Project>> {
		try {
			const companyId = await this.findCompanyByUserId(userId);
			if (!companyId) {
				throw new HttpException("Not found company", HttpStatus.NOT_FOUND);
			}

			const companyProvinces = await getRepository(ZipCode)
				.createQueryBuilder("zipCode")
				.leftJoinAndSelect("zipCode.provinces", "province")
				.leftJoinAndSelect("province.companies", "company")
				.where("company.id = :companyId", { companyId })
				.select("zipCode.id")
				.getMany();

			const companyMunicipalities = await getRepository(ZipCode)
				.createQueryBuilder("zipCode")
				.leftJoinAndSelect("zipCode.municipalities", "municipality")
				.leftJoinAndSelect("municipality.companies", "company")
				.where("company.id = :companyId", { companyId })
				.select("zipCode.id")
				.getMany();

			const companyCities = await getRepository(ZipCode)
				.createQueryBuilder("zipCode")
				.leftJoinAndSelect("zipCode.city", "city")
				.leftJoinAndSelect("city.companies", "company")
				.where("company.id = :companyId", { companyId })
				.select("zipCode.id")
				.getMany();

			const companyRegionsZipCodeIds = [...companyProvinces.map((zip) => zip.id), ...companyMunicipalities.map((zip) => zip.id), ...companyCities.map((zip) => zip.id)];

			const companyWithBlacklist = await getRepository(Company)
				.createQueryBuilder("company")
				.leftJoinAndSelect("company.blacklist", "blacklist")
				.where("company.id = :companyId", { companyId })
				.getOne();

			const blacklistIds = companyWithBlacklist?.blacklist?.map((project) => project.id);

			if (!categories || categories.length === 0) {
				throw new HttpException("Company has no category", HttpStatus.BAD_REQUEST);
			}

			const quotes = await getRepository(Qoute)
				.createQueryBuilder("qoute")
				.leftJoinAndSelect("qoute.project", "project")
				.where("qoute.companyId = :companyId", {
					companyId,
				})
				.andWhere("qoute.isAccepted = :isAccepted", {
					isAccepted: false,
				})
				.getMany();

			const projectIds = quotes.filter((q) => !!q.project).map((q) => q.project?.id);

			const projectInterestedIds = [];
			try {
				if (interestedData.use) {
					const projectInterested = await getRepository(Company)
						.createQueryBuilder("company")
						.leftJoinAndSelect("company.interestedProject", "interestedProject")
						.where("company.id = :id", { id: companyId })
						.andWhere(`interestedProject.progress = :progress`, {
							progress: ProjectProgress.MODERATED,
						})
						.getOne();

					projectInterested?.interestedProject?.forEach((p) => {
						projectInterestedIds.push(p.id);
					});
				}
			} catch (error) {
				console.error("projectInterested", error);
			}

			const queryBuilder = getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.category", "category")
				.leftJoinAndSelect("project.qoutes", "qoute")
				.leftJoinAndSelect("qoute.company", "company")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.leftJoinAndSelect("zipCode.city", "city")
				.leftJoinAndSelect("company.interestedProject", "interestedProject")
				.orderBy("project.createdAt", "DESC");

			if (showAnswered) {
				queryBuilder.where("company.id = :companyId", { companyId }).andWhere("qoute.isAccepted = :isAccepted", { isAccepted: false });
			} else {
				queryBuilder
					.where("category.id IN (:...categories)", { categories })
					.andWhere("project.progress = :progress", {
						progress: ProjectProgress.MODERATED,
					})
					.andWhere("(company.id != :companyId OR company.id IS NULL)", {
						companyId,
					})
					.andWhere("(qoute.isAccepted = :isAccepted OR qoute.isAccepted IS NULL)", { isAccepted: false });

				if (!interestedData.use && projectIds?.length) {
					queryBuilder.andWhere("project.id NOT IN (:...projectIds)", {
						projectIds,
					});
				}

				if (companyRegionsZipCodeIds?.length) {
					queryBuilder.andWhere("project.zipCode IN (:...regions)", {
						regions: companyRegionsZipCodeIds,
					});
				}

				if (blacklistIds && blacklistIds?.length) {
					queryBuilder.andWhere("NOT(project.id IN (:...blacklistIds))", {
						blacklistIds,
					});
				}
			}

			if (interestedData.use) {
				if (interestedData.interested) {
					if (projectInterestedIds?.length) {
						queryBuilder.andWhere("project.id IN (:...projectIds)", {
							projectIds: projectInterestedIds,
						});
					} else {
						queryBuilder.andWhere("project.id IN (null)", {});
					}
				} else if (projectInterestedIds?.length) {
					queryBuilder.andWhere("project.id NOT IN (:...projectIds)", {
						projectIds: projectInterestedIds,
					});
				}
			}

			return await paginate<Project>(queryBuilder, options);
		} catch (error) {
			this.logger.error(error, error.stack);
			throw new HttpException(error, 400);
		}
	}

	async findCompanyForProject(projectId: string, options: IPaginationOptions, props) {
		try {
			let project = await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.leftJoinAndSelect("project.category", "category")
				.where("project.id = :id", { id: projectId })
				.getOne();

			if (project) {
				const zipcode = await this.getZipcode(project.zipCode.id);

				project = {
					...project,
					zipCode: zipcode,
				};
			}

			const projectCity = await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.leftJoinAndSelect("zipCode.city", "city")
				.leftJoinAndSelect("city.companies", "cityCompanies")
				.where("project.id = :id", { id: projectId })
				.getOne();

			const projectProvince = await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.leftJoinAndSelect("zipCode.provinces", "province")
				.leftJoinAndSelect("province.companies", "provinceCompanies")
				.where("project.id = :id", { id: projectId })
				.getOne();

			const cityCompanies = projectCity.zipCode.city.companies;
			const provinceCompanies = projectProvince.zipCode.provinces[0].companies;

			const companies = [...cityCompanies.map((company) => company.id), ...provinceCompanies.map((company) => company.id)];

			const queryBuilder = getRepository(Company)
				.createQueryBuilder("company")
				.leftJoinAndSelect("company.categories", "category")
				.where("category.id = :id", { id: project.category.id })
				.andWhere("(company.email != '' and company.email is not null)")
				.orderBy("company.name", "ASC");

			if (companies?.length) {
				queryBuilder.andWhere("company.id IN (:...companies)", { companies });
			}

			if (props?.search) {
				queryBuilder.andWhere("company.name ILIKE :searchQuery", {
					searchQuery: `%${props.search}%`,
				});
			}

			const companiesPagintation = await paginate<Company>(queryBuilder, options);

			const qoutes = await this.getProjectQuotes(projectId);

			return {
				items: companiesPagintation.items.map(({ id, name }) => {
					const quote = qoutes?.list?.find((comp) => comp.id == id);
					return {
						id,
						name,
						quote: {
							isAccepted: quote?.isAccepted || false,
							isInterested: quote?.isInterested || false,
							isQuote: quote?.isQuote || false,
							sendRequest: quote?.sendRequest || false,
						},
					};
				}),
				meta: companiesPagintation.meta,
			};
		} catch (error) {
			this.logger.error("findCompanyForProject", error);
		}
	}

	async isAssignProject(projectId: string) {
		return await getRepository(Project).createQueryBuilder("project").leftJoinAndSelect("project.company", "company").where("project.id = :projectId", { projectId }).getOne();
	}

	async findOne(id: string, companyId?: string, full?: boolean): Promise<Project> {
		try {
			const queryBuilder = getRepository(Project).createQueryBuilder("project").leftJoinAndSelect("project.zipCode", "zipCode").where("project.id = :id", { id });

			if (full) {
				queryBuilder
					.leftJoinAndSelect("project.review", "review")
					.leftJoinAndSelect("project.events", "events")
					.leftJoinAndSelect("project.qoutes", "qoute")
					.leftJoinAndSelect("qoute.company", "company")
					.leftJoinAndSelect("project.user", "user")
					.select(["project", "zipCode", "qoute", "company", "user.id", "user.name", "user.surname", "user.phoneNumber", "user.email", "user.language"])
					.orderBy("events.date", "DESC");
			}

			let project = await queryBuilder.getOne();

			if (project) {
				const zipcode = await this.getZipcode(project.zipCode.id);

				project = {
					...project,
					zipCode: zipcode,
				};
			}

			if (full && companyId) {
				project.qoutes = project?.qoutes?.filter((q) => q.company.id === companyId) || null;
				project.qoutes = project?.qoutes?.length ? project.qoutes : null;
			}

			return project;
		} catch (error) {
			this.logger.error(error);
		}
	}

	async update(id: string, updateProjectDto: UpdateProjectDto): Promise<Project> {
		try {
			await this.projectsService.update(id, updateProjectDto);
			return await this.projectsService.findOne(id);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await this.projectsService.delete(id);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async findCompanyFiltersByUserId(id: string): Promise<{ categories: string[] }> {
		try {
			const companyId = await this.findCompanyByUserId(id);

			const company = await getRepository(Company)
				.createQueryBuilder("company")
				.leftJoinAndSelect("company.categories", "categories")
				.where("company.id = :id", { id: companyId })
				.getOne();

			return {
				categories: company?.categories?.map((category) => category.id),
			};
		} catch (error) {
			this.logger.error(error);
		}
	}

	async findProjectWithQuotas(id: string): Promise<Project> {
		try {
			let project = await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.qoutes", "qoute")
				.leftJoinAndSelect("qoute.company", "quoteCompany")
				.leftJoinAndSelect("project.zipCode", "zipCode")
				.where("project.id = :id", { id })
				.getOne();

			if (project) {
				const zipcode = await this.getZipcode(project.zipCode.id);
				return {
					...project,
					zipCode: zipcode,
				};
			}

			return project;
		} catch (error) {
			this.logger.error("findProjectWithQuotas", error);
		}
	}

	async findUserByProjectId(id: string): Promise<User> {
		try {
			const project = await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.user", "user")
				.where("project.id = :id", { id })
				.select(["project.id", "user"])
				.getOne();
			return project?.user;
		} catch (error) {
			this.logger.error(error);
		}
	}

	async startProject(id: string): Promise<Project> {
		try {
			await this.projectsService.update(id, {
				startedAt: new Date(Date.now()),
				progress: ProjectProgress.ACTIVE,
			});
			return await this.projectsService.findOne(id);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async finishProject(id: string): Promise<Project> {
		try {
			await this.projectsService.update(id, {
				finishedAt: new Date(Date.now()),
				progress: ProjectProgress.FINISHED,
			});
			return await this.projectsService.findOne(id);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async findTimeline(id: string) {
		try {
			return await getRepository(Project)
				.createQueryBuilder("project")
				.leftJoinAndSelect("project.qoutes", "quota")
				.where("project.id = :id", { id })
				.select([
					"project.progress",
					"project.createdAt",
					"project.startedAt",
					"project.finishedAt",
					"project.isCompanyConfirmedFinish",
					"project.isCustomerConfirmedFinish",
					"quota.createdAt",
					"quota.acceptedAt",
				])
				.getOne();
		} catch (error) {
			this.logger.error(error);
		}
	}

	async confirmCompanyFinish(projectId: string) {
		try {
			await this.projectsService.update(projectId, {
				isCompanyConfirmedFinish: true,
			});
		} catch (error) {
			this.logger.error(error);
		}
	}

	async findQuoteMatchWithCompanyFilter(projectId: string, hasMembers: boolean, companiesIds: string[] = []) {
		const project = await getRepository(Project)
			.createQueryBuilder("project")
			.leftJoinAndSelect("project.category", "category")
			.leftJoinAndSelect("project.zipCode", "zipCode")
			.where("project.id = :projectId", {
				projectId,
			})
			.getOne();

		const queryBuilder = await getRepository(Company)
			.createQueryBuilder("company")
			.select(["company.id", "company.name", "company.email", "company.email2", "company.isNotification"])
			.leftJoinAndSelect("company.members", "members")
			.innerJoinAndSelect("company.categories", "categories")
			.where("categories.id = :categoryId", {
				categoryId: project.category.id,
			});

		if (companiesIds && companiesIds.length) {
			queryBuilder.andWhere("company.id in (:...companiesIds)", {
				companiesIds,
			});
		}

		const companies = await queryBuilder.getMany();

		const mapCompanies = companies
			.map((company) => {
				if (company.members.length == 0 && company.email != "") {
					let data = {
						...company,
						members: [
							{
								id: "",
								name: company.name,
								email: company.email,
								email2: company.email2,
								isNotification: company.isNotification,
								role: UserRole.COMPANY_ADMIN,
								language: ELanguages.SWEDISH,
							},
						],
					};

					return {
						data,
						exist: false,
					};
				}

				return {
					data: company,
					exist: true,
				};
			})
			.filter((item) => {
				return (hasMembers && item.exist) || (!hasMembers && !item.exist);
			});
		return mapCompanies?.map((item) => item.data);
	}
}
