import { Skeleton, SkeletonList } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-7 w-36" />
      <SkeletonList rows={4} />
    </div>
  );
}
