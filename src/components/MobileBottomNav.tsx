import { Package, Store, UserCheck, Compass, MessageSquare } from 'lucide-react';
import { AppTab } from './Header';

interface MobileBottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  unreadAlertsCount: number;
  unreadMessagesCount?: number;
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  unreadAlertsCount,
  unreadMessagesCount = 0,
}: MobileBottomNavProps) {
  const tabs: Array<{
    id: AppTab;
    label: string;
    icon: typeof Compass;
    badge?: number;
  }> = [
    { id: 'explore', label: 'Shops', icon: Compass },
    { id: 'orders', label: 'Orders', icon: Package, badge: unreadAlertsCount },
    { id: 'messages', label: 'Chat', icon: MessageSquare, badge: unreadMessagesCount },
    { id: 'owner', label: 'Sell', icon: Store },
    { id: 'account', label: 'Account', icon: UserCheck },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 pb-safe"
    >
      <div className="grid grid-cols-5 h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-1 transition-colors relative cursor-pointer ${
                isActive ? 'text-[#D94E1F]' : 'text-stone-500 hover:text-[#141413]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                {typeof tab.badge === 'number' && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-[#D94E1F] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
