import { Switch, Route, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Login from "./pages/login";
import Register from "./pages/register";
import Dashboard from "./pages/dashboard";
import Members from "./pages/members";
import Plans from "./pages/plans";
import Payments from "./pages/payments";
import CheckIns from "./pages/checkins";
import Notifications from "./pages/notifications";
import Staff from "./pages/staff";
import SuperAdmin from "./pages/superadmin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold animate-pulse">GF</div>
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Redirect to="/login" />;

  return <Component />;
}

import MemberPortal from "./pages/member-portal";
import WorkoutPrograms from "./pages/workout-programs";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
      {/* Public member portal route */}
      <Route path="/member/:token" component={MemberPortal} />

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>

      <Route path="/dashboard">
        <Layout>
          <ProtectedRoute component={Dashboard} />
        </Layout>
      </Route>

      <Route path="/members">
        <Layout>
          <ProtectedRoute component={Members} />
        </Layout>
      </Route>

      <Route path="/plans">
        <Layout>
          <ProtectedRoute component={Plans} />
        </Layout>
      </Route>

      <Route path="/payments">
        <Layout>
          <ProtectedRoute component={Payments} />
        </Layout>
      </Route>

      <Route path="/checkins">
        <Layout>
          <ProtectedRoute component={CheckIns} />
        </Layout>
      </Route>

      <Route path="/workout-programs">
        <Layout>
          <ProtectedRoute component={WorkoutPrograms} />
        </Layout>
      </Route>

      <Route path="/notifications">
        <Layout>
          <ProtectedRoute component={Notifications} />
        </Layout>
      </Route>

      <Route path="/staff">
        <Layout>
          <ProtectedRoute component={Staff} />
        </Layout>
      </Route>

      <Route path="/superadmin" component={SuperAdmin} />

      <Route>
        <Layout>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
              <p className="text-muted-foreground">This page doesn't exist or is under construction.</p>
            </div>
          </div>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Router />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
