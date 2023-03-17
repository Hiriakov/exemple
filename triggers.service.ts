import { Repository } from "typeorm";
import { I18nService } from "nestjs-i18n";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";

import { ProjectSendRequest } from "./entities/project-send-request.entity";
import { CompaniesService } from "src/modules/companies/companies.service";
import { ELanguages, EventTriggers, UserRole } from "src/common/enums";
import { CreateMessageDto } from "../messages/dto/create-message.dto";
import { getMemberByRole } from "../companies/companies.helper";
import { EmailService } from "src/modules/email/email.service";
import { Company } from "../companies/entities/company.entity";
import { MessagesService } from "../messages/messages.service";
import { getPathToLanguageMessage } from "src/common/helpers";
import { InvitesService } from "../invites/invites.service";
import { EMessageFromType } from "../messages/enums";
import { ProjectsService } from "./projects.service";
import { SendEmailTemplateDto } from "../email/dto";
import { EProjectSendRequestFields } from "./enums";

@Injectable()
//Service for sending emails
export class TriggersService {
	constructor(
		private readonly emailService: EmailService,
		private readonly projectsService: ProjectsService,
		private readonly companiesService: CompaniesService,
		private readonly i18nService: I18nService,
		private readonly configService: ConfigService,
		private readonly invitesService: InvitesService,
		private readonly messagesService: MessagesService,
		@InjectRepository(ProjectSendRequest)
		private projectSendRequestRepository: Repository<ProjectSendRequest>
	) {}

	async newProject(projectId: string) {
		const project = await this.projectsService.findOne(projectId);
		if (!project) return;

		const adminEmails = ["a@gmail.com", "b@gmail.com", "c@gmail.com"];

		const messages: SendEmailTemplateDto[] = adminEmails.map((email) => {
			return {
				to: email,
				templateAlias: EventTriggers.ADMIN_NEW_PROJECT,
				templateModel: {
					project_name: project.name,
					language: ELanguages.ENGLISH,
				},
			};
		});

		await this.emailService.sendBatchWithTemplates(messages);
	}

	async finishCompany(projectId: string) {
		// company-marked-project-as-finish
		const project = await this.projectsService.findOne(projectId, undefined, true);
		const company = await this.projectsService.findCompanyById(projectId);
		const adminCompany = await this.companiesService.findCompanyAdmin(company.id);

		this.emailService.sendTemplate({
			to: project.user.email,
			templateAlias: EventTriggers.COMPANY_MARKED_PROJECT_AS_FINISH,
			templateModel: {
				language: adminCompany.language,
				project_name: project.name,
				company_name: company.name,
			},
		});
	}

	async finishCustomer(projectId: string) {
		// customer-marked-project-as-finish
		const project = await this.projectsService.findOne(projectId, undefined, true);
		const company = await this.projectsService.findCompanyById(projectId);
		const adminCompany = await this.companiesService.findCompanyAdmin(company.id);

		const baseUrl = this.configService.get<string>("BASE_URL");

		this.emailService.sendTemplate({
			to: adminCompany.email,
			templateAlias: EventTriggers.CUSTOMER_MARKED_PROJECT_AS_FINISH,
			templateModel: {
				language: project.user.language,
				project_name: project.name,
				company_name: company.name,
				customer_name: `${adminCompany.name} ${adminCompany.surname}`,
				rateCompanyUrl: `${baseUrl}/customer/projects/${project.id}/rate-company/`,
				rateBYGGUrl: `${baseUrl}/customer/projects/${project.id}/rate-bygg/${project.review?.id || ""}`,
			},
		});
	}

	updatedStatusToModerated(projectId: string) {
		return this.quoteMatchedCompany(projectId);
	}

	async quoteMatchedCompany(projectId: string, companiesIds: string[] = [], enableNotifcation: boolean = true) {
		const [project, companyNotMemebers, companyHasMembers] = await Promise.all([
			this.projectsService.findOneWithTrigger(projectId),
			this.projectsService.findQuoteMatchWithCompanyFilter(projectId, false, companiesIds),
			this.projectsService.findQuoteMatchWithCompanyFilter(projectId, true, companiesIds),
		]);

		const urlHref = `/company/requests/${project.id}`;
		const baseUrl = this.configService.get<string>("BASE_URL");
		const { href: url } = new URL(urlHref, baseUrl);

		const zipCode = project?.zipCode;
		const projectAddress = [];
		if (zipCode?.city?.name) {
			projectAddress.push(zipCode.city.name);
		}

		const customerFirstname = project.user.name;

		const filterNotification = (company: Company) => !enableNotifcation || (enableNotifcation && company.isNotification);

		const enableCompanyMembers = companyHasMembers.filter(filterNotification);
		const enableCompanyNotMembers = companyNotMemebers.filter(filterNotification);
		const companyCommon = [...enableCompanyMembers, ...enableCompanyNotMembers];

		const inviteCompanies = [];
		for (const company of companyCommon) {
			const admin = getMemberByRole(company.members, UserRole.COMPANY_ADMIN);
			const url = await this.invitesService.getInviteUrlCompany(company.id, admin.email, urlHref);
			const urlRegister = await this.invitesService.getInviteUrlCompany(company.id, admin.email);
			inviteCompanies.push({
				companyId: company.id,
				url: url.href,
				urlRegister: urlRegister.href,
			});
		}

		// if company has any members
		const emailWithHasMembers = enableCompanyMembers.map((company) => {
			const admin = getMemberByRole(company.members, UserRole.COMPANY_ADMIN);

			const adminLanguage = ELanguages.SWEDISH;

			const projectStart = this.i18nService.t(`projects.desiredStartDates.${project.desiredStartDate}`, {
				lang: adminLanguage,
			});

			const invite = inviteCompanies.find((invite) => invite.companyId == company.id);
			const inviteUrl = invite?.url || url;
			const urlRegister = invite?.urlRegister || url;

			console.log("invite - reg", {
				email: admin.email,
				companyId: company.id,
				inviteUrl,
				urlRegister,
			});

			return {
				to: admin.email,
				templateModel: {
					project_name: project.name,
					project_address: projectAddress.join(", "),
					project_description: project.description,
					project_start: projectStart,
					customer_name: customerFirstname,
					url: inviteUrl,
					url_register: urlRegister,
					language: adminLanguage,
				},
				templateAlias: EventTriggers.QOUTE_MATHCED_COMPANY_REGISTERED_USERS,
			};
		});

		const messagesWithHasMembers: CreateMessageDto[] = companyHasMembers.map((company) => {
			const admin = getMemberByRole(company.members, UserRole.COMPANY_ADMIN);

			const adminLanguage = ELanguages.SWEDISH;

			return {
				user: admin.id,
				fromProjectId: project.id,
				fromType: EMessageFromType.PROJECT,
				text: this.i18nService.t(getPathToLanguageMessage(EventTriggers.QOUTE_MATHCED_COMPANY_REGISTERED_USERS), {
					args: {
						project_name: project.name,
					},
					lang: adminLanguage,
				}),
			};
		});

		// if company has not any members, then send to company email
		const emailWithOnlyAdmin = enableCompanyNotMembers.map((company) => {
			const admin = getMemberByRole(company.members, UserRole.COMPANY_ADMIN);

			const adminLanguage = ELanguages.SWEDISH;

			const projectStart = this.i18nService.t(`projects.desiredStartDates.${project.desiredStartDate}`, {
				lang: adminLanguage,
			});

			const invite = inviteCompanies.find((invite) => invite.companyId == company.id);
			const inviteUrl = invite?.url || url;
			const urlRegister = invite?.urlRegister || url;

			console.log("invite - no reg", {
				email: admin.email,
				companyId: company.id,
				inviteUrl,
				urlRegister,
			});

			return {
				to: admin.email,
				templateModel: {
					project_name: project.name,
					project_address: projectAddress.join(", "),
					project_description: project.description,
					project_start: projectStart,
					customer_name: customerFirstname,
					url: inviteUrl,
					url_register: urlRegister,
					language: adminLanguage,
				},
				templateAlias: EventTriggers.QOUTE_MATHCED_COMPANY_NO_REGISTERED_USERS,
			};
		});

		let emailAdminResult;
		if (emailWithOnlyAdmin.length) {
			emailAdminResult = await this.emailService.sendBatchWithTemplates(emailWithOnlyAdmin);
		}

		let emailMemberResult;
		if (companyHasMembers.length) {
			emailMemberResult = await Promise.all([this.emailService.sendBatchWithTemplates(emailWithHasMembers), this.messagesService.createBulk(messagesWithHasMembers)]);
		}

		if (companiesIds.length) {
			await this.projectSendRequestRepository.upsert(
				companiesIds.map((companyId) => {
					return {
						companyId,
						projectId,
					};
				}),
				[EProjectSendRequestFields.companyId, EProjectSendRequestFields.projectId]
			);
		}

		return true;
	}

	async companyShowsInterest(projectId: string, companyId: string) {
		const [project, company] = await Promise.all([this.projectsService.findOne(projectId, companyId, true), this.companiesService.findOne(companyId)]);

		const projectAddress = [];
		if (company?.provinces[0]?.name) {
			projectAddress.push(company.provinces[0].name);
		}
		if (company?.municipalities[0]?.name) {
			projectAddress.push(company.municipalities[0].name);
		}
		if (company?.cities[0]?.name) {
			projectAddress.push(company.cities[0].name);
		}

		await this.emailService.sendTemplate({
			to: project.user.email,
			templateAlias: EventTriggers.COMPANY_SHOWS_INTEREST,
			templateModel: {
				company_name: company.name,
				company_phone: company.phone,
				company_email: company.email,
				company_address: projectAddress.join(", "),
				language: project.user.language,
			},
		});
	}
}
