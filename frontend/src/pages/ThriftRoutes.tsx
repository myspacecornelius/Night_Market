import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const ThriftRoutes = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">ThriftRoutes</h1>
        <p className="text-gray-500 dark:text-gray-400">Find and share the best thrift routes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Not built yet</CardTitle>
          <CardDescription>
            Routes are planned but nothing here is stored or shared yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            In the meantime, the heatmap shows where the community is posting and Dropzones lists live meetups.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default ThriftRoutes
