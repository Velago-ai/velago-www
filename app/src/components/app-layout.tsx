import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { MessageCircle, CalendarCheck, Settings as SettingsIcon } from "lucide-react";
import velagoLogo from "@assets/velago_logo_nobg.svg";

const LOGO_FILTER =
  "brightness(0) saturate(100%) invert(28%) sepia(98%) saturate(3500%) hue-rotate(228deg) brightness(98%) contrast(101%)";

const NAV = [
  { href: "/voice", label: "Chat", icon: MessageCircle },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppLayout({
  children,
  rightSlot,
  contentClassName = "",
}: {
  children: ReactNode;
  rightSlot?: ReactNode;
  contentClassName?: string;
}) {
  const [location] = useLocation();
  const isActive = (href: string) =>
    href === "/voice"
      ? location === "/voice" || location === "/"
      : location.startsWith(href);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Desktop top nav */}
      <header className="hidden md:flex sticky top-0 z-30 h-[60px] bg-white border-b border-border px-6 items-center">
        <Link href="/voice" className="flex items-center gap-2 mr-8">
          <img src={velagoLogo} alt="VelaGo" className="h-8 w-8" style={{ filter: LOGO_FILTER }} />
          <span className="font-display font-bold text-lg tracking-tight text-foreground">VelaGo</span>
        </Link>
        <nav className="flex items-center gap-2">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  active
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">{rightSlot}</div>
      </header>

      {/* Mobile top bar (logo + right slot) */}
      <header className="md:hidden sticky top-0 z-30 h-14 bg-white/90 backdrop-blur border-b border-border px-4 flex items-center">
        <Link href="/voice" className="flex items-center gap-2">
          <img src={velagoLogo} alt="VelaGo" className="h-7 w-7" style={{ filter: LOGO_FILTER }} />
          <span className="font-display font-bold text-base tracking-tight text-foreground">VelaGo</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">{rightSlot}</div>
      </header>

      <main className={`flex-1 flex flex-col pb-16 md:pb-0 ${contentClassName}`}>{children}</main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white border-t border-border flex items-stretch"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((n) => {
          const active = isActive(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon
                className="w-5 h-5"
                strokeWidth={active ? 2.4 : 1.8}
                fill={active ? "currentColor" : "none"}
                fillOpacity={active ? 0.12 : 0}
              />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
