import { FREE_LIMITS } from './config.js';

export function useEntitlement() {
  return { tier: 'free', limits: FREE_LIMITS };
}
