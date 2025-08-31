import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/Skeleton"
import { toast } from "sonner"

const ThriftRoutes = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">ThriftRoutes</h1>
        <p className="text-gray-500 dark:text-gray-400">Find and share the best thrift routes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>This feature is under construction.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-3">
            <Skeleton className="h-[125px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
          <Button className="mt-4" onClick={() => toast.success('Thanks for your patience!')}>Notify Me</Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default ThriftRoutes
