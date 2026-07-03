export function publicChallengeFields(data: Record<string, unknown>) {
  const {
    platformFeePercent: _platformFeePercent,
    platformFeeVisibility: _platformFeeVisibility,
    platformShareCents: _platformShareCents,
    adminRevenueCents: _adminRevenueCents,
    internalPricingNotes: _internalPricingNotes,
    adminNotes: _adminNotes,
    ...publicData
  } = data;
  return publicData;
}
