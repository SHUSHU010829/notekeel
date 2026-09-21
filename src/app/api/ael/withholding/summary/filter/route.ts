import { NextResponse } from 'next/server'
import { summaryFilter } from '../../../../../../mock/aggregate'
import { MOCK_RECORDS } from '../../../../../../mock/records'
import type { SummaryFilterRequest } from '../../../../../../types/withholding'

/** Mock：POST /ael/withholding/summary/filter */
export async function POST(request: Request) {
  const body = (await request.json()) as SummaryFilterRequest
  if (!body?.companyUuid || !body?.paymentYear) {
    return NextResponse.json({ code: 400, message: 'companyUuid 與 paymentYear 為必填。' }, { status: 400 })
  }
  return NextResponse.json({ code: 200, message: 'ok', data: summaryFilter(MOCK_RECORDS, body) })
}
