export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
    </div>
  )
}
