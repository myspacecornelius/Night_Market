import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

const Dashboard = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">Welcome back, User!</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>HeatMap</CardTitle>
            <CardDescription>Visualize drop zones and hot spots.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => toast.info('Navigating to HeatMap...')}>View HeatMap</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>LACES</CardTitle>
            <CardDescription>Manage your laces and releases.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => toast.info('Navigating to LACES...')}>View Laces</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>DropZones</CardTitle>
            <CardDescription>Discover and manage drop zones.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => toast.info('Navigating to DropZones...')}>View DropZones</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Dashboard
