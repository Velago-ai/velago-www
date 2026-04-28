import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isAuthenticated } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import Voice from "@/pages/voice";
import Bookings from "@/pages/bookings";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function RootPage() {
  return isAuthenticated() ? <Voice /> : <Home />;
}

function BookingsRoute() {
  return isAuthenticated() ? <Bookings /> : <Voice />;
}

function SettingsRoute() {
  return isAuthenticated() ? <Settings /> : <Voice />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootPage} />
      <Route path="/landing" component={Home} />
      <Route path="/auth" component={Auth} />
      <Route path="/voice" component={Voice} />
      <Route path="/bookings" component={BookingsRoute} />
      <Route path="/settings" component={SettingsRoute} />
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
