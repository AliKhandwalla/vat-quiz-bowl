// Network/gateway errors can lose a committed response. Preserve the request ID
// unless a database/API rejection confirms that this call was rejected.
export function isDefinitiveFailure(error: unknown): boolean {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    typeof error.code !== "string"
  )
    return false;
  return /^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d{3}$/.test(error.code);
}
