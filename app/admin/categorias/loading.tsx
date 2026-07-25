import { HeaderSkeleton, TableSkeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <TableSkeleton rows={4} cols={3} />
    </div>
  )
}
