export default function AnaliseLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-32 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[rgba(14,40,65,0.05)] animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
        <div className="h-64 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
      </div>
      <div className="h-72 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
    </div>
  )
}
