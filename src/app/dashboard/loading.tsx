export default function DashboardLoading() {
  return <div role="status" aria-label="Loading dashboard" className="min-h-dvh bg-muted p-4">
    <div className="mx-auto max-w-7xl animate-pulse space-y-5 rounded-3xl bg-background p-6">
      <div className="flex h-14 items-center justify-between rounded-2xl bg-primary/10 px-4"><div className="h-7 w-64 rounded-full bg-white" /><div className="size-9 rounded-full bg-white" /></div>
      <div className="h-8 w-48 rounded-xl bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(i => <div key={i} className="h-36 rounded-2xl bg-primary/5" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><div className="h-64 rounded-2xl bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div>
      <p className="sr-only">Loading dashboard / ڈیش بورڈ لوڈ ہورہا ہے</p>
    </div>
  </div>;
}
