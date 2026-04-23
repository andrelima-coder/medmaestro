export default function SimuladosLoading() {
  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-8 w-36 rounded-lg bg-white/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-white/3 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
