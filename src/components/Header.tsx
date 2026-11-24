import { ShoppingBag } from 'lucide-react';

export type AppTab = 'explore' | 'orders' | 'messages' | 'owner' | 'account';

interface HeaderProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  cartCount: number;
  onOpenCart: () => void;
  userDisplayName: string | null;
}

export function Header({
  activeTab,
  onSelectTab,
  cartCount,
  onOpenCart,
  userDisplayName,
}: HeaderProps) {
  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'explore', label: 'Shops' },
    { id: 'orders', label: 'Orders' },
    { id: 'messages', label: 'Messages' },
    { id: 'owner', label: 'List Shop' },
    { id: 'account', label: userDisplayName ? 'Account' : 'Sign In' },
  ];

  return (
    <header className="relative md:sticky md:top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-stone-200/80">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element brand wordmark */}
        <button
          type="button"
          onClick={() => onSelectTab('explore')}
          className="font-display text-lg font-extrabold tracking-tight text-[#141413] whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94E1F] rounded"
        >
          Nkomazi Eats
        </button>

        {/* Zone 2: 4 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94E1F] ${
                  isActive
                    ? 'border-[#D94E1F] text-[#141413] font-semibold'
                    : 'border-transparent text-stone-600 hover:text-[#141413] hover:border-stone-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#141413] text-white text-xs sm:text-sm font-semibold hover:bg-stone-800 active:scale-[0.98] transition-all flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94E1F]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="tabular-nums">Bag ({cartCount})</span>
          </button>
        </div>
      </div>
    </header>
  );
}
