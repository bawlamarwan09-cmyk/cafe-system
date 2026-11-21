import { menuNameKey } from './monalisa-menu.mjs';

const doubleCoffeeNames = new Set(['Café double', 'Double espresso', 'Double expresso'].map(menuNameKey));
export function orderMenuProducts(products) {
  return [...products].sort((a, b) => Number(doubleCoffeeNames.has(menuNameKey(a.name))) - Number(doubleCoffeeNames.has(menuNameKey(b.name))));
}
