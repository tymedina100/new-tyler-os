import { Skeleton, SkeletonList } from "@/components/ui/states";

/**
 * List-only. Lives in the `(list)` group so it does not wrap `/projects/[id]`.
 * A loading.tsx covering the detail page would stream first and commit HTTP 200,
 * so `notFound()` could not return a real 404.
 */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-7 w-40" />
      <SkeletonList rows={6} />
    </div>
  );
}
