/** 規格「過渡期說明」：API 未上線或呼叫失敗時不白屏、不噴例外 */
export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="alert" role="alert">
      <div>
        <div className="title">查詢資料時發生問題</div>
        <div className="desc">{message}</div>
      </div>
    </div>
  )
}
