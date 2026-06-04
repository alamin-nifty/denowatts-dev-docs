// Turns a route into a stable screenshot filename slug.
// Used by BOTH the React app and scripts/screenshot.mjs so they always agree.
// "/orders/approvals" -> "orders-approvals"
// "/orders/:id"       -> "orders-id"
// "/"                 -> "home"
export function routeSlug(route) {
  const s = route.replace(/^\/+/, '').replace(/[:/]+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase()
  return s || 'home'
}
