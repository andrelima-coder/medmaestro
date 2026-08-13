export default function FlashcardsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-44 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
          <div className="mt-2 h-4 w-72 rounded bg-[rgba(14,40,65,0.05)] animate-pulse" />
        </div>
        <div className="h-8 w-40 rounded-lg bg-[rgba(14,40,65,0.05)] animate-pulse" />
      </div>
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
