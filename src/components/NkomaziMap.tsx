import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORY_LABELS, GeoPoint, Shop, ShopCategory } from '../types/marketplace';
import {
  NKOMAZI_CENTER,
  calculateDistanceKm,
  formatDistanceKm,
  getShopCoordinates,
} from '../utils/geo';

interface NkomaziMapProps {
  shops: Shop[];
  userLocation: GeoPoint | null;
  highlightedShopId: string | null;
  onHighlightShop: (shopId: string) => void;
  onOpenShop: (shopId: string) => void;
}

const CATEGORY_COLORS: Record<ShopCategory, string> = {
  food: '#D94E1F',
  iphones: '#141413',
  electronics: '#166534',
};

function createShopMarkerIcon(category: ShopCategory, isHighlighted: boolean): L.DivIcon {
  const color = CATEGORY_COLORS[category] || '#D94E1F';
  const size = isHighlighted ? 32 : 24;
  const border = isHighlighted ? '3px solid #FFFFFF' : '2.5px solid #FFFFFF';
  const shadow = isHighlighted
    ? '0 4px 14px rgba(20,20,19,0.45)'
    : '0 2px 8px rgba(20,20,19,0.32)';

  return L.divIcon({
    className: 'nkomazi-map-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${border};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;transition:transform 150ms ease;">
      <div style="width:${isHighlighted ? 8 : 6}px;height:${isHighlighted ? 8 : 6}px;border-radius:9999px;background:#FFFFFF;"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createUserMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'nkomazi-user-pin',
    html: `<div style="width:20px;height:20px;border-radius:9999px;background:#2563EB;border:3px solid #FFFFFF;box-shadow:0 2px 10px rgba(37,99,235,0.5);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
  });
}

function buildPopupElement(
  shop: Shop,
  distanceKm: number | null,
  onOpenShop: (shopId: string) => void
): HTMLElement {
  const container = document.createElement('div');
  container.style.minWidth = '195px';
  container.style.fontFamily = '"DM Sans", system-ui, sans-serif';

  const kicker = document.createElement('p');
  kicker.style.margin = '0 0 2px 0';
  kicker.style.fontSize = '11px';
  kicker.style.fontWeight = '600';
  kicker.style.color = CATEGORY_COLORS[shop.category];
  kicker.textContent = `${CATEGORY_LABELS[shop.category]} · ${shop.town}`;

  const title = document.createElement('p');
  title.style.margin = '0 0 4px 0';
  title.style.fontSize = '14px';
  title.style.fontWeight = '700';
  title.style.color = '#141413';
  title.textContent = shop.name;

  const meta = document.createElement('p');
  meta.style.margin = '0 0 8px 0';
  meta.style.fontSize = '12px';
  meta.style.color = '#57534E';
  const statusPart = shop.isOpen ? 'Open' : 'Closed';
  const hoursPart = shop.openingHours ? ` (${shop.openingHours})` : '';
  const distancePart = distanceKm !== null ? `${formatDistanceKm(distanceKm)} · ` : '';
  meta.textContent = `${statusPart}${hoursPart} · ${distancePart}R${shop.deliveryFee} delivery`;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Open Shop';
  btn.style.width = '100%';
  btn.style.padding = '7px 12px';
  btn.style.borderRadius = '8px';
  btn.style.border = 'none';
  btn.style.background = '#141413';
  btn.style.color = '#FFFFFF';
  btn.style.fontSize = '12px';
  btn.style.fontWeight = '600';
  btn.style.cursor = 'pointer';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onOpenShop(shop.id);
  });

  container.appendChild(kicker);
  container.appendChild(title);
  container.appendChild(meta);
  container.appendChild(btn);
  return container;
}

export function NkomaziMap({
  shops,
  userLocation,
  highlightedShopId,
  onHighlightShop,
  onOpenShop,
}: NkomaziMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersByIdRef = useRef<Record<string, L.Marker>>({});
  const userLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [NKOMAZI_CENTER.lat, NKOMAZI_CENTER.lng],
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    userLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      userLayerRef.current = null;
      markersByIdRef.current = {};
    };
  }, []);

  // Render shop markers & update popups
  useEffect(() => {
    const map = mapRef.current;
    const layer = markersLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersByIdRef.current = {};

    const boundsPoints: L.LatLngExpression[] = [];

    for (const shop of shops) {
      const coords = getShopCoordinates(shop);
      const distanceKm = userLocation
        ? calculateDistanceKm(userLocation.lat, userLocation.lng, coords.lat, coords.lng)
        : null;
      const isHighlighted = shop.id === highlightedShopId;

      const marker = L.marker([coords.lat, coords.lng], {
        icon: createShopMarkerIcon(shop.category, isHighlighted),
        zIndexOffset: isHighlighted ? 500 : 0,
      });

      marker.bindPopup(buildPopupElement(shop, distanceKm, onOpenShop));
      marker.on('click', () => {
        onHighlightShop(shop.id);
      });

      marker.addTo(layer);
      markersByIdRef.current[shop.id] = marker;
      boundsPoints.push([coords.lat, coords.lng]);
    }

    if (userLocation) {
      boundsPoints.push([userLocation.lat, userLocation.lng]);
    }

    if (!highlightedShopId && boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    }
  }, [shops, userLocation, highlightedShopId, onHighlightShop, onOpenShop]);

  // Render user anchor location marker
  useEffect(() => {
    const userLayer = userLayerRef.current;
    if (!userLayer) return;
    userLayer.clearLayers();

    if (userLocation) {
      const userMarker = L.marker([userLocation.lat, userLocation.lng], {
        icon: createUserMarkerIcon(),
        zIndexOffset: 600,
      });
      const label = document.createElement('div');
      label.style.fontSize = '12px';
      label.style.fontWeight = '600';
      label.textContent = userLocation.label || 'Your Location';
      userMarker.bindPopup(label);
      userMarker.addTo(userLayer);
    }
  }, [userLocation]);

  // Fly to highlighted shop & open popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !highlightedShopId) return;
    const marker = markersByIdRef.current[highlightedShopId];
    if (marker) {
      const latLng = marker.getLatLng();
      map.flyTo(latLng, Math.max(map.getZoom(), 13), { duration: 0.45 });
      marker.openPopup();
    }
  }, [highlightedShopId]);

  function handleFitAll() {
    const map = mapRef.current;
    if (!map || shops.length === 0) return;
    const pts: L.LatLngExpression[] = shops.map((s) => {
      const c = getShopCoordinates(s);
      return [c.lat, c.lng];
    });
    if (userLocation) {
      pts.push([userLocation.lat, userLocation.lng]);
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13 });
  }

  return (
    <div className="relative w-full h-full min-h-[360px] lg:min-h-[520px] rounded-2xl overflow-hidden border border-stone-200 bg-stone-100">
      <div ref={containerRef} className="w-full h-full min-h-[360px] lg:min-h-[520px] z-10" />

      {/* Map Legend & Fit All Control */}
      <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-sm border border-stone-200 rounded-xl px-3 py-2 flex flex-wrap items-center gap-3 text-[11px] font-medium text-stone-700 shadow-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D94E1F]" />
          Food
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#141413]" />
          iPhones
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#166534]" />
          Electronics
        </span>
        {userLocation && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            You
          </span>
        )}
        <button
          type="button"
          onClick={handleFitAll}
          className="ml-1 pl-2 border-l border-stone-200 text-[#141413] font-semibold hover:text-[#D94E1F] cursor-pointer"
        >
          Fit All
        </button>
      </div>
    </div>
  );
}
