import { Button } from '@/components/ui/Button'
import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-center">
      <h1 className="text-9xl font-bold text-indigo-600">404</h1>
      <h2 className="mt-4 text-3xl font-bold">Page Not Found</h2>
      <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
        Sorry, the page you are looking for does not exist.
      </p>
      <Button asChild className="mt-8">
        <Link to="/">Go to Dashboard</Link>
      </Button>
    </div>
  )
}

export default NotFound
