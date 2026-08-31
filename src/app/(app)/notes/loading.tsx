import { Skeleton, SkeletonList } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-24 w-full" />
      <SkeletonList rows={5} />
    </div>
  );
}
