import { Navigate, useLocation } from 'react-router-dom'

// TODO: Replace with actual auth logic
const useAuth = () => {
  const user = localStorage.getItem('user')
  if (user) {
    return { isAuthenticated: true }
  }
  return { isAuthenticated: false }
}

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

export default ProtectedRoute
