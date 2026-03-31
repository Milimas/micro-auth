import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthGuard from './components/AuthGuard.tsx'
import GraphList from './pages/GraphList.tsx'
import GraphDetail from './pages/GraphDetail.tsx'
import Profile from './pages/Profile.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <AuthGuard>
        {(user) => (
          <Routes>
            <Route path="/" element={<GraphList user={user} />} />
            <Route path="/graphs/:id" element={<GraphDetail user={user} />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        )}
      </AuthGuard>
    </BrowserRouter>
  )
}
