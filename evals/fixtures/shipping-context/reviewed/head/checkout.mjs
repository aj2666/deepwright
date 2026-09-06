import { taxRate } from "./pricing.mjs";

export function total(subtotal) {
  return subtotal * (1 + taxRate());
}
