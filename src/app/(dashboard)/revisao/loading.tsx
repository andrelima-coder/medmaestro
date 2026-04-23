export default function RevisaoLoading() {
  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="h-7 w-40 rounded-lg bg-white/5 animate-pulse" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white/3 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
