import { useState } from 'react'
import { Heart, LogOut, Settings, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SUPPORT_NOW, SupportDialog } from '@/components/mind/Support'
import { useAuth } from '@/context/useAuth'
import { useTheme } from '@/context/useTheme'
import type { Theme } from '@/context/theme-context'
import { useLogout } from '@/hooks/useLogout'
import { THEME_OPTIONS } from '@/lib/themeOptions'
import { cn } from '@/lib/utils'

/** Phone-sized account menu: support, profile, settings, theme and logout (the sidebar has these on desktop). */
export function UserMenu({ className }: { className?: string }) {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { loggingOut, logout } = useLogout()
  const initial = user?.name.trim().charAt(0).toUpperCase() || '?'
  const [support, setSupport] = useState(false)

  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className={cn('rounded-full font-heading text-base font-semibold', className)}
          aria-label="Account and theme"
        >
          {initial}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium text-foreground">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setSupport(true)} className="text-mental-foreground focus:text-mental-foreground">
          <Heart className="fill-current text-mental" /> Need support now
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound /> Profile & goals
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={loggingOut} onSelect={() => void logout()}>
          <LogOut /> {loggingOut ? 'Logging out…' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
      <SupportDialog open={support} onOpenChange={setSupport} description={SUPPORT_NOW} />
    </>
  )
}
