import { apiGet, apiPost } from './apiClient'
import type {
  GroupFilterRequest,
  GroupFilterResponse,
  SummaryFilterRequest,
  SummaryFilterResponse,
  WithholdingDetail,
} from '../types/withholding'

/** L1 彙總列表 */
export function fetchSummaryList(req: SummaryFilterRequest): Promise<SummaryFilterResponse> {
  return apiPost<SummaryFilterResponse>('/ael/withholding/summary/filter', req)
}

/** L2 群組內明細 */
export function fetchGroupDetails(req: GroupFilterRequest): Promise<GroupFilterResponse> {
  return apiPost<GroupFilterResponse>('/ael/withholding/summary/group/filter', req)
}

/** L3 單筆詳細（既有端點） */
export function fetchWithholdingDetail(companyUuid: string, uuid: string): Promise<WithholdingDetail> {
  return apiGet<WithholdingDetail>('/ael/withholding/detail', { companyUuid, uuid })
}
