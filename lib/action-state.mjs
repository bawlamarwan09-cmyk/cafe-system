// Server-owned refresh scopes. Never accept table names or scopes from a client.
const stock = ['inventory','products','coffeeReady','stockMoves'];
const team = ['employees','accounts','orderWaiters','orderPinAlerts'];
const scopes = {
 'order-edit': ['orders','sacks',...stock],
 cancel: ['orders','sacks',...stock],
 employee: team,
 'employee-edit': team,
 'employee-delete': team,
 'employee-order-pin': ['orderWaiters','orderPinAlerts'],
 'change-order-pin': ['orderWaiters','orderPinAlerts'],
 workday: ['workdays'],
 account: ['accounts'],
 'receipt-settings': ['receiptSettings'],
 category: ['categories','products'],
 'category-delete': ['categories','products'],
 product: ['products','categories'],
 'product-delete': ['products'],
 inventory: stock,
 'inventory-delete': stock,
 'sack-open': ['sacks',...stock],
 'sack-close': ['sacks','products','coffeeReady'],
 'sack-assign': ['sacks'],
 'purchase-edit': ['movements',...stock],
 'purchase-delete': ['movements',...stock],
 close: ['closings','movements'],
};
export function actionStateSections(type, body = {}) {
 if (type === 'movement') return [...new Set(['movements',...(['purchase','adjustment'].includes(body.kind) ? stock : [])])];
 return scopes[type] ? [...new Set(scopes[type])] : null;
}
