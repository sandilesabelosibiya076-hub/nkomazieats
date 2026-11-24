import { ArrowLeft, Clock, MapPin, MessageSquare, Phone, Plus, Check } from 'lucide-react';
import { CATEGORY_LABELS, Product, Shop } from '../types/marketplace';
import { ResilientImage } from './ResilientImage';

interface ShopDetailViewProps {
  shop: Shop;
  products: Product[];
  onBack: () => void;
  onAddToCart: (product: Product, shop: Shop) => void;
  onMessageShop: (shop: Shop) => void;
  cartQuantities: Record<string, number>;
}

export function ShopDetailView({
  shop,
  products,
  onBack,
  onAddToCart,
  onMessageShop,
  cartQuantities,
}: ShopDetailViewProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] inline-flex items-center gap-2 text-sm font-semibold text-stone-700 hover:text-[#141413] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Nkomazi Shops</span>
      </button>

      {/* Shop Header Split */}
      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-5 aspect-[16/10] lg:aspect-auto lg:min-h-[260px] bg-stone-100">
          <ResilientImage
            src={shop.imageUrl}
            alt={shop.name}
            category={shop.category}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
              <span className="font-semibold text-[#D94E1F]">
                {CATEGORY_LABELS[shop.category]}
              </span>
              <span aria-hidden="true">·</span>
              <span>{shop.town}, Nkomazi</span>
              <span aria-hidden="true">·</span>
              <span className={shop.isOpen ? 'text-[#166534] font-semibold' : 'text-red-700 font-semibold'}>
                {shop.isOpen ? 'Open' : 'Closed'}
              </span>
              {shop.openingHours && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{shop.openingHours}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141413]">
                {shop.name}
              </h1>

              <button
                type="button"
                onClick={() => onMessageShop(shop)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-stone-300 bg-white text-[#141413] text-xs font-semibold hover:bg-stone-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-[#D94E1F]" />
                <span>Message Shop</span>
              </button>
            </div>

            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-2xl">
              {shop.description}
            </p>
          </div>

          <div className="pt-4 border-t border-stone-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-stone-700">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="truncate">{shop.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="tabular-nums">
                {shop.openingHours ? `${shop.openingHours} · ` : ''}
                {shop.etaMinutes} · R{shop.deliveryFee} delivery
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-stone-400 shrink-0" />
              <span className="tabular-nums">{shop.contactPhone}</span>
            </div>
          </div>
        </div>
      </div>

      {!shop.isOpen && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800">
          This shop is currently <strong>Closed</strong>
          {shop.openingHours ? ` (Hours: ${shop.openingHours})` : ''}. You can still browse items or message the shop owner directly.
        </div>
      )}

      {/* Products Grid */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold text-[#141413]">
            Available Items ({products.length})
          </h2>
          <span className="text-xs text-stone-500">Prices in ZAR</span>
        </div>

        {products.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-sm text-stone-600">
            This shop has not listed any products yet. Check back shortly.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => {
              const qtyInCart = cartQuantities[product.id] || 0;
              return (
                <article
                  key={product.id}
                  className="bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all"
                >
                  <div className="aspect-[4/3] bg-stone-100">
                    <ResilientImage
                      src={product.imageUrl}
                      alt={product.name}
                      category={product.category}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <p className="text-xs text-stone-500 truncate">
                        {product.specs || CATEGORY_LABELS[product.category]}
                      </p>
                      <h3 className="font-display text-base font-bold text-[#141413] leading-snug">
                        {product.name}
                      </h3>
                      <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
                        {product.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-stone-100">
                      <span className="font-mono text-base font-semibold text-[#141413] tabular-nums">
                        R{product.price.toLocaleString('en-ZA')}
                      </span>

                      <button
                        type="button"
                        disabled={!product.inStock || !shop.isOpen}
                        onClick={() => onAddToCart(product, shop)}
                        className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          qtyInCart > 0
                            ? 'bg-[#166534] text-white hover:bg-[#14532D]'
                            : 'bg-[#141413] text-white hover:bg-stone-800'
                        }`}
                      >
                        {qtyInCart > 0 ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span className="tabular-nums">In Bag ({qtyInCart})</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>{product.inStock ? 'Add' : 'Sold Out'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
