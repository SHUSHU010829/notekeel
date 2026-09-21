import { NextResponse } from 'next/server'
import { MOCK_RECORDS } from '../../../../../mock/records'

/** Mock：GET /ael/withholding/detail?companyUuid=&uuid= */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const uuid = searchParams.get('uuid')
  const record = MOCK_RECORDS.find((item) => item.uuid === uuid)
  if (!record) {
    return NextResponse.json({ code: 404, message: '查無此筆扣繳資料。' }, { status: 404 })
  }
  return NextResponse.json({ code: 200, message: 'ok', data: record })
}
