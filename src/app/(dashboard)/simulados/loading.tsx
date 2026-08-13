export default function SimuladosLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
        <div className="h-8 w-36 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
