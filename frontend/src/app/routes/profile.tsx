import { Skeleton } from "@/components/ui/Skeleton";

export default function Profile() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Profile</h1>
      <div className="mt-4">
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
