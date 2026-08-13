export default function QuestoesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-7 w-48 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-32 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-[rgba(14,40,65,0.03)] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
