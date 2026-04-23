export default function AnaliseLoading() {
  return (
    <div className="aurora-bg flex flex-col gap-6">
      <div className="h-7 w-32 rounded-lg bg-white/5 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-white/3 animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-white/3 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/3 animate-pulse" />
      </div>
      <div className="h-72 rounded-xl bg-white/3 animate-pulse" />
    </div>
  )
}
