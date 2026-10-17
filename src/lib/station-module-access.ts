/** Keep legacy bills and rental add-ons accessible without allowing new F&B orders. */
export function stationModuleAccess(
  modules: { cafe?: boolean } | undefined,
  hasRentalAddons: boolean,
  hasExistingOrders: boolean,
) {
  const canOrderCafe = modules?.cafe !== false;
  return {
    canOrderCafe,
    showOrderTab: canOrderCafe || hasRentalAddons || hasExistingOrders,
    canLinkCafeTable: canOrderCafe,
  };
}