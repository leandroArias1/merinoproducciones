import { HeaderSkeleton, Skeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}
