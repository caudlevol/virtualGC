import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import ChatPage from "@/pages/chat";
import QuoteView from "@/pages/quote-view";
import SharedQuote from "@/pages/shared-quote";
import DemoPage from "@/pages/demo";
import HistoryPage from "@/pages/history";
import AdminOverview from "@/pages/admin/overview";
import AdminUsers from "@/pages/admin/users";
import AdminOrganizations from "@/pages/admin/organizations";
import { AdminGuard } from "@/components/admin-guard";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={LandingPage} />
      <Route path="/demo" component={DemoPage} />
      <Route path="/quote/:uuid" component={SharedQuote} />
      
      <Route path="/login">
        {() => <AuthPage defaultTab="login" />}
      </Route>
      <Route path="/register">
        {() => <AuthPage defaultTab="register" />}
      </Route>

      {/* Protected Routes (Protection handled within components via useAuth) */}
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/chat/:id" component={ChatPage} />
      <Route path="/quotes" component={HistoryPage} />
      <Route path="/quotes/:id" component={QuoteView} />

      {/* Admin Routes (Protected by AdminGuard — requires super_admin role) */}
      <Route path="/admin">
        {() => <AdminGuard><AdminOverview /></AdminGuard>}
      </Route>
      <Route path="/admin/users">
        {() => <AdminGuard><AdminUsers /></AdminGuard>}
      </Route>
      <Route path="/admin/organizations">
        {() => <AdminGuard><AdminOrganizations /></AdminGuard>}
      </Route>

      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
