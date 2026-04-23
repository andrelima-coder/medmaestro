export default function LotesLoading() {
  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-8 w-28 rounded-lg bg-white/5 animate-pulse" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white/3 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
