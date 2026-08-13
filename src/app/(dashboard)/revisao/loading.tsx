export default function RevisaoLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-40 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
