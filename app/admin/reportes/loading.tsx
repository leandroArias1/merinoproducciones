import { HeaderSkeleton, Skeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
