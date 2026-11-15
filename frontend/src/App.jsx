import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import { Navbar } from "./components/common/Navbar";
import { ProtectedRoute } from "./components/common/ProtectedRoute";

// Pages
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";
import { WorkspaceDetailPage } from "./pages/WorkspaceDetailPage";
import { DevelopersPage } from "./pages/DevelopersPage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { DirectMessagesPage } from "./pages/DirectMessagesPage";
import { ProfilePage } from "./pages/ProfilePage";

const ProjectsRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/workspaces/${id}`} replace />;
};

const WorkspaceChatRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/workspaces/${id}?tab=chat`} replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
            <Navbar />
            <main className="flex-1">
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/developers" element={<DevelopersPage />} />
                <Route path="/profile/:username" element={<ProfilePage />} />

                {/* Protected Routes */}
                <Route
                  path="/workspaces"
                  element={
                    <ProtectedRoute>
                      <WorkspacesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/workspaces/:id"
                  element={
                    <ProtectedRoute>
                      <WorkspaceDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/projects/:id"
                  element={
                    <ProtectedRoute>
                      <ProjectsRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/opportunities"
                  element={
                    <ProtectedRoute>
                      <OpportunitiesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/opportunities/:id"
                  element={
                    <ProtectedRoute>
                      <OpportunitiesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <ProtectedRoute>
                      <DirectMessagesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat/workspace/:id"
                  element={
                    <ProtectedRoute>
                      <WorkspaceChatRedirect />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/chat/:conversationId"
                  element={
                    <ProtectedRoute>
                      <DirectMessagesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />

                {/* Catch-all redirect */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
