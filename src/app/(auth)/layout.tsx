export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-aurora min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="login-aurora-top" />
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
      <p className="absolute bottom-6 left-0 right-0 z-10 text-center text-[11px] text-[var(--mm-muted)]">
        MedMaestro v1.0 · AMIB / TEMI 2026
      </p>
    </div>
  )
}
