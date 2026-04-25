export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export const KM_PER_MI = 1.609344;
export const MI_PER_KM = 1 / KM_PER_MI;

export const M_PER_KM = 1000;
export const YD_PER_KM = 1093.6132983377079;

export function toMetricWeight(weight: number, unit: 'kg' | 'lb'): number {
  if (!Number.isFinite(weight)) {
    return 0;
  }
  return unit === 'lb' ? weight * KG_PER_LB : weight;
}

export function fromMetricWeight(weightKg: number, unit: 'kg' | 'lb'): number {
  if (!Number.isFinite(weightKg)) {
    return 0;
  }
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg;
}

export function toMetricDistance(distance: number, unit: 'km' | 'mi'): number {
  if (!Number.isFinite(distance)) {
    return 0;
  }
  return unit === 'mi' ? distance * KM_PER_MI : distance;
}

export function fromMetricDistance(distanceKm: number, unit: 'km' | 'mi'): number {
  if (!Number.isFinite(distanceKm)) {
    return 0;
  }
  return unit === 'mi' ? distanceKm * MI_PER_KM : distanceKm;
}

export function toMetricLapDistance(
  lapDistance: number,
  distanceUnit: 'km' | 'mi'
): number {
  if (!Number.isFinite(lapDistance)) {
    return 0;
  }
  return distanceUnit === 'mi' ? lapDistance / YD_PER_KM : lapDistance / M_PER_KM;
}

export function fromMetricLapDistance(
  lapDistanceKm: number,
  distanceUnit: 'km' | 'mi'
): number {
  if (!Number.isFinite(lapDistanceKm)) {
    return 0;
  }
  return distanceUnit === 'mi' ? lapDistanceKm * YD_PER_KM : lapDistanceKm * M_PER_KM;
}
