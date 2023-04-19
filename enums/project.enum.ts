export const ProjectTable = 'project' as const

export enum EProjectFields {
  id = 'id',
  name = 'name',
  status = 'status',
  zipCode = 'zipCode',
  description = 'description',
  files = 'files',
  createdAt = 'createdAt',
  progress = 'progress',
  startedAt = 'startedAt',
  isCompanyConfirmedFinish = 'isCompanyConfirmedFinish',
  isCustomerConfirmedFinish = 'isCustomerConfirmedFinish',
  finishedAt = 'finishedAt',
  desiredStartDate = 'desiredStartDate',
  clientType = 'clientType',

  // relations fields

  companyId = 'companyId',
  userId = 'userId',
  zipCodeId = 'zipCodeId',
  categoryId = 'categoryId',

  // relations

  user = 'user',
  company = 'company',
  category = 'category',
  qoutes = 'qoutes',
  events = 'events',
  review = 'review',
  rejected = 'rejected',
  interestedCompany = 'interestedCompany',
}
