import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <EmptyState
      title="Nothing here"
      description="That page or item does not exist. It may have been deleted."
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/">Back to Today</Link>
        </Button>
      }
    />
  );
}
