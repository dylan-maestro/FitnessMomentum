import { DECAY_RATE_PER_DAY, TONNAGE_TO_MOMENTUM } from './momentum';

export function calculateReps(
  momentum: number,
  baseVolume: number = 0,
  effectiveWeight: number = 1,
  decayRate: number = DECAY_RATE_PER_DAY,
  targetIncreasePercentage: number = 0,
  daysSinceLastLog: number = 1,
  targetFrequency: number = 1,
  momentumFactor?: number,
  roundingMode: 'ceil' | 'none' = 'ceil'
): number {
  let totalVolume = 0;

  // 1. Determine effective overload percentage based on frequency adherence
  // If daysSinceLastLog < targetFrequency, we scale down the increase.
  // Example: Target 7 days, elapsed 5 days, Increase 10% -> Effective Increase = 10% * (5/7)
  // If daysSinceLastLog >= targetFrequency, use full increase.
  const safeFrequency = Math.max(1, targetFrequency);
  const adherenceRatio = Math.min(1, Math.max(0, daysSinceLastLog / safeFrequency));
  const effectiveIncreasePercentage = targetIncreasePercentage * adherenceRatio;

  // 2. Calculate target from Base Volume (applying overload)
  const targetBaseVolume = baseVolume * (1 + effectiveIncreasePercentage);

  // 3. Calculate target from Momentum
  // Determine the effective catch-up period: min(actual gap, target frequency)
  // Ensure we catch up at least 1 day if there is any gap, but allow partial calculation if needed.
  // Generally, daysSinceLastLog will be >= 1 for inter-day calculations.
  let catchupDays = Math.min(daysSinceLastLog, safeFrequency);
  
  // Safety: If catchupDays is < 0 (shouldn't happen), treat as 0.
  // If catchupDays is 0 (e.g. same day and we ignore intra-day decay for target setting?),
  // we default to 1 for the purpose of "maintenance target" if we want to show a daily target.
  // However, if the user explicitly wants to recover 7 days, and daysSinceLastLog=7, k=7.
  if (catchupDays < 1) catchupDays = 1;

  let targetMomentumVolume = 0;
  
  if (momentum > 0) {
    // Reverse the decay over the catch-up period to find the reference 'peak' momentum
    // M_peak = M_current * e^(rate * k)
    const decayFactor = Math.exp(decayRate * catchupDays);
    const preDecayMomentum = momentum * decayFactor;
    
    // Apply the growth factor to the peak momentum
    const targetMomentum = preDecayMomentum * (1 + effectiveIncreasePercentage);
    
    // Calculate how much momentum we need to add to the CURRENT state to reach the TARGET
    const requiredMomentumGain = targetMomentum - momentum;

    if (requiredMomentumGain > 0) {
      const factor = momentumFactor ?? TONNAGE_TO_MOMENTUM;
      targetMomentumVolume = requiredMomentumGain / factor;
    }
  }

  // 4. The target volume is the greater of the two strategies
  totalVolume = Math.max(targetBaseVolume, targetMomentumVolume);

  // Ensure weight is at least 1 to avoid division by zero
  const safeEffectiveWeight = effectiveWeight > 0 ? effectiveWeight : 1;

  const reps = totalVolume / safeEffectiveWeight;

  // Weight/reps-based targets should stay whole numbers, but distance
  // targets need decimal precision for smoother goal guidance.
  return roundingMode === 'none' ? reps : Math.ceil(reps);
}
