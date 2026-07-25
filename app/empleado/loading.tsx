import { Skeleton } from '@/components/shell/skeletons'

export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-6">
      <Skeleton className="h-5 w-28" />
      <div className="mt-10 space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-56" />
      </div>
      <div className="mt-8 space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-64" />
      </div>
      <div className="mt-auto pt-10">
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
