import { Skeleton } from "@/components/ui/Skeleton";

export default function Dropzones() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dropzones</h1>
      <div className="mt-4">
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
