import { HeaderSkeleton, TableSkeleton } from '@/components/shell/skeletons'
export default function Loading() {
  return (
    <div>
      <HeaderSkeleton />
      <TableSkeleton rows={6} cols={5} />
    </div>
  )
}
