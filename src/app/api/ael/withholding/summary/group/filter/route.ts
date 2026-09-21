import { NextResponse } from 'next/server'
import { groupFilter } from '../../../../../../../mock/aggregate'
import { MOCK_RECORDS } from '../../../../../../../mock/records'
import type { GroupFilterRequest } from '../../../../../../../types/withholding'

/** Mock：POST /ael/withholding/summary/group/filter */
export async function POST(request: Request) {
  const body = (await request.json()) as GroupFilterRequest
  if (!body?.companyUuid || !body?.groupKey || !body?.incomeType) {
    return NextResponse.json(
      { code: 400, message: 'companyUuid、incomeType、groupKey 為必填。' },
      { status: 400 },
    )
  }
  try {
    return NextResponse.json({ code: 200, message: 'ok', data: groupFilter(MOCK_RECORDS, body) })
  } catch (error) {
    return NextResponse.json({ code: 404, message: (error as Error).message }, { status: 404 })
  }
}
