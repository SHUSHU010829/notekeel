import { MOCK_COMPANY_UUID } from '../mock/records'

/** 實際專案應從登入狀態／公司切換器取得；此處先以環境變數為準 */
export function getCompanyUuid(): string {
  return process.env.COMPANY_UUID ?? MOCK_COMPANY_UUID
}
