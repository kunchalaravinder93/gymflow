import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard, Users, CreditCard, Ticket,
  ShieldCheck, Bell, LogOut, Building, Menu, X, Dumbbell
} from "lucide-react";
import { useGetUnreadNotificationCount } from "@workspace/api-client-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members",   label: "Members",   icon: Users },
  { href: "/plans",     label: "Plans",     icon: Ticket },
  { href: "/payments",  label: "Payments",  icon: CreditCard },
  { href: "/checkins",  label: "Check-in Terminal", icon: ShieldCheck },
  { href: "/workout-programs", label: "Workout Programs", icon: Dumbbell },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/staff",     label: "Staff",     icon: Building },
];

function NavLink({
  href, label, icon: Icon, active, badge, onClick,
}: {
  href: string; label: string; icon: React.ElementType;
  active: boolean; badge?: number; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full",
        active
          ? "bg-primary text-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
          {badge}
        </span>
      )}
    </Link>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { data: unreadCount } = useGetUnreadNotificationCount({
    query: { refetchInterval: 30000 },
  });

  return (
    <div className="flex h-full flex-col bg-sidebar border-r border-border">
      <div className="flex items-center gap-2 p-4 border-b border-border/50">
        <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          GF
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sidebar-foreground leading-none">GymFlow</h2>
          <p className="text-xs text-sidebar-foreground/60 truncate mt-0.5">{user?.gymName}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-sidebar-foreground/60 hover:text-sidebar-foreground lg:hidden">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map(({ href, label, icon }) => (
          <NavLink
            key={href}
            href={href}
            label={label}
            icon={icon}
            active={href === "/dashboard" ? location === href : location.startsWith(href)}
            badge={href === "/notifications" ? unreadCount?.count : undefined}
            onClick={onClose}
          />
        ))}
      </nav>

      <div className="border-t border-border/50 p-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium shrink-0">
            {user?.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium w-full text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return <>{children}</>;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar — always visible */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col">
        <Sidebar />
      </aside>

      {/* Mobile sidebar — drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-60 z-50">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex h-14 items-center gap-3 border-b border-border px-4 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">GF</div>
            <span className="font-bold text-base">GymFlow</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
