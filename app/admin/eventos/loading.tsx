import { HeaderSkeleton, FiltersSkeleton, TableSkeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <FiltersSkeleton />
      <TableSkeleton rows={6} cols={4} />
    </div>
  )
}
