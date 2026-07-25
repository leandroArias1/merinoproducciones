import { HeaderSkeleton, Skeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
