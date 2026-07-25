import { HeaderSkeleton, FiltersSkeleton, TableSkeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <FiltersSkeleton />
      <TableSkeleton rows={8} cols={6} />
    </div>
  )
}
