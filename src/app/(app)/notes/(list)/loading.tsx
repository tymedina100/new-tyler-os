import { Skeleton, SkeletonList } from "@/components/ui/states";

/**
 * List-only. Lives in the `(list)` group so it does not wrap `/notes/[id]`.
 * A loading.tsx covering the detail page would stream first and commit HTTP 200,
 * so `notFound()` could not return a real 404.
 */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-24 w-full" />
      <SkeletonList rows={5} />
    </div>
  );
}
