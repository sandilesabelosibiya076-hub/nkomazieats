import { GeoPoint, NkomaziTown, Shop } from '../types/marketplace';

export const NKOMAZI_CENTER: GeoPoint = {
  lat: -25.565,
  lng: 31.735,
  label: 'Nkomazi Central',
};

export const NKOMAZI_TOWN_COORDS: Record<NkomaziTown, GeoPoint> = {
  Malalane: { lat: -25.4718, lng: 31.515, label: 'Malalane' },
  Komatipoort: { lat: -25.4368, lng: 31.9554, label: 'Komatipoort' },
  Tonga: { lat: -25.6761, lng: 31.7875, label: 'Tonga' },
  Kamaqhekeza: { lat: -25.6542, lng: 31.8845, label: 'Kamaqhekeza' },
  Naas: { lat: -25.6435, lng: 31.8325, label: 'Naas' },
  Hectorspruit: { lat: -25.4342, lng: 31.6828, label: 'Hectorspruit' },
  Schoemansdal: { lat: -25.7136, lng: 31.5292, label: 'Schoemansdal' },
  Matsamo: { lat: -25.7364, lng: 31.4981, label: 'Matsamo' },
  Buffelspruit: { lat: -25.6214, lng: 31.6085, label: 'Buffelspruit' },
  Driekoppies: { lat: -25.7042, lng: 31.5528, label: 'Driekoppies' },
  Sibange: { lat: -25.7392, lng: 31.7995, label: 'Sibange' },
  'Jeppes Reef': { lat: -25.7589, lng: 31.4864, label: 'Jeppes Reef' },
};

export function getShopCoordinates(shop: Shop): GeoPoint {
  if (
    typeof shop.latitude === 'number' &&
    typeof shop.longitude === 'number' &&
    Number.isFinite(shop.latitude) &&
    Number.isFinite(shop.longitude)
  ) {
    return { lat: shop.latitude, lng: shop.longitude, label: shop.name };
  }
  const fallback = NKOMAZI_TOWN_COORDS[shop.town] || NKOMAZI_CENTER;
  return { lat: fallback.lat, lng: fallback.lng, label: shop.town };
}

export function calculateDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m away`;
  }
  return `${km.toFixed(1)} km away`;
}
