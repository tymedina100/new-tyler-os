import { Skeleton, SkeletonList } from "@/components/ui/states";

/**
 * Today only. A loading.tsx beside the `(app)` layout would wrap every
 * authenticated route, including detail pages that call `notFound()`, and
 * commit HTTP 200 before a missing record could return 404.
 */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-7 w-40" />
      <SkeletonList rows={6} />
    </div>
  );
}
