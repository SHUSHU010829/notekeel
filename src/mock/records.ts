import type { IncomeType, WithholdingDetail } from '../types/withholding'

/**
 * 假資料：涵蓋規格裡所有需要被驗證的情境
 *  - 同一所得人同類別跨 12 期（租金）
 *  - 一筆租約多房東、以租賃地址分群
 *  - 同一人有多個類別（應拆成多列）
 *  - 身分證與統編混用、兩者皆空的舊資料
 *  - 部分未繳納的扣繳稅額／二代健保
 *  - 受贈 97、其他所得 92 無二代健保（回 0）
 */

const NHI_RATE = 0.0211
const WITHHOLD_RATE = 0.1

let seq = 0
function makeUuid(): string {
  seq += 1
  return `rec-${String(seq).padStart(4, '0')}`
}

interface RecordSeed {
  incomeType: IncomeType
  recipientName: string
  identityNo?: string
  taxIdNo?: string
  months: number[]
  gross: number
  rentalAddress?: string
  coRecipientNames?: string[]
  withNhi?: boolean
  unremitWithholdingMonths?: number[]
  unremitNhiMonths?: number[]
  note?: string
}

function expand(year: number, seed: RecordSeed): WithholdingDetail[] {
  return seed.months.map((month) => {
    const withholdingAmount = Math.round(seed.gross * WITHHOLD_RATE)
    const nhiAmount = seed.withNhi === false ? 0 : Math.round(seed.gross * NHI_RATE)
    return {
      uuid: makeUuid(),
      incomeType: seed.incomeType,
      paymentYear: year,
      paymentMonth: month,
      paymentDate: `${year}/${String(month).padStart(2, '0')}/05`,
      recipientName: seed.recipientName,
      identityNo: seed.identityNo ?? '',
      taxIdNo: seed.taxIdNo ?? '',
      grossIncome: seed.gross,
      withholdingAmount,
      nhiAmount,
      paymentAmount: seed.gross - withholdingAmount - nhiAmount,
      isRemitWithholding: !(seed.unremitWithholdingMonths ?? []).includes(month),
      isRemitNhi: !(seed.unremitNhiMonths ?? []).includes(month),
      rentalAddress: seed.rentalAddress,
      coRecipientNames: seed.coRecipientNames,
      note: seed.note,
    }
  })
}

const ALL = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const SEEDS: RecordSeed[] = [
  // 租金：同一租約兩位房東，金額無法分攤 → 以租賃地址分群
  {
    incomeType: '51',
    recipientName: '王小明',
    identityNo: 'A123456789',
    months: ALL(12),
    gross: 20000,
    rentalAddress: '台北市大安區復興南路一段 390 號 5 樓',
    coRecipientNames: ['王小華'],
    unremitWithholdingMonths: [11, 12],
  },
  {
    incomeType: '51',
    recipientName: '陳美玲',
    identityNo: 'F220123456',
    months: ALL(8),
    gross: 35000,
    rentalAddress: '新北市板橋區文化路二段 88 號 12 樓之 3',
    unremitNhiMonths: [7, 8],
  },
  {
    incomeType: '51',
    recipientName: '宏達資產管理股份有限公司',
    taxIdNo: '84149956',
    months: [1, 4, 7, 10],
    gross: 120000,
    rentalAddress: '台中市西屯區台灣大道三段 301 號 20 樓',
  },
  // 執行業務：同一人同類別跨期彙總
  {
    incomeType: '9A',
    recipientName: '林建宏',
    identityNo: 'B101234567',
    months: [2, 5, 8, 11],
    gross: 20000,
    unremitWithholdingMonths: [11],
  },
  // 同一人不同類別 → L1 應出現兩列
  {
    incomeType: '9B',
    recipientName: '林建宏',
    identityNo: 'B101234567',
    months: [3, 6],
    gross: 12000,
  },
  {
    incomeType: '9A',
    recipientName: '張雅婷',
    identityNo: 'C201234568',
    months: ALL(6),
    gross: 45000,
    unremitNhiMonths: [5, 6],
    unremitWithholdingMonths: [6],
  },
  {
    incomeType: '9B',
    recipientName: '黃國豪',
    identityNo: 'D110234569',
    months: [1, 2, 3, 4],
    gross: 8000,
  },
  {
    incomeType: '53',
    recipientName: '吳承恩',
    identityNo: 'E122345670',
    months: [9],
    gross: 150000,
    unremitWithholdingMonths: [9],
  },
  {
    incomeType: '5B',
    recipientName: '合信投資有限公司',
    taxIdNo: '27654321',
    months: [6, 12],
    gross: 88000,
    withNhi: false,
  },
  {
    incomeType: '91',
    recipientName: '蔡佩君',
    identityNo: 'G222345671',
    months: [4],
    gross: 260000,
  },
  {
    incomeType: '93',
    recipientName: '許志偉',
    identityNo: 'H123345672',
    months: [12],
    gross: 500000,
    withNhi: false,
  },
  // 受贈 97 無二代健保 → totalNhiAmount 回 0
  {
    incomeType: '97',
    recipientName: '財團法人明日教育基金會',
    taxIdNo: '12345678',
    months: [3, 9],
    gross: 100000,
    withNhi: false,
  },
  // 其他所得 92 無二代健保
  {
    incomeType: '92',
    recipientName: '劉冠廷',
    identityNo: 'J101345673',
    months: [5, 10],
    gross: 30000,
    withNhi: false,
    unremitWithholdingMonths: [10],
  },
  // 舊資料：身分證與統編皆空 → 退回以姓名分群
  {
    incomeType: '92',
    recipientName: '無統編舊資料',
    months: [2, 8],
    gross: 15000,
    withNhi: false,
    note: '舊系統轉入，缺身分證／統編',
  },
]

function build(year: number): WithholdingDetail[] {
  return SEEDS.flatMap((seed) => expand(year, seed))
}

/** 兩個年度的資料，用來驗證 yearly 統計只受 paymentYear 影響 */
export const MOCK_RECORDS: WithholdingDetail[] = [...build(114), ...build(113)]

export const MOCK_COMPANY_UUID = 'company-demo-0001'
