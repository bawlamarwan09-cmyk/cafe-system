export const monalisaCategories = [
  'Boissons chaudes', 'Boissons fraîches', 'Smoothies', 'Milkshakes', 'Nos spécialités',
  'Tajine', 'Poêle', 'Suppléments', 'Soda', 'Eau minérale',
  'Crêpes', 'Pancakes', 'Cocktail', 'Gaufres', 'Fête',
];

// Prices in dirhams transcribed from the previous Monalisa register.
const sections = {
  Cafés: [
    ['Café à emporter',12], ['Café alone',13], ['Café américain',13],
    ['Café crème',11], ['Café normal',11,['Café noir','Espresso','Expresso']],
    ['Café sans eau',8], ['Cappuccino pistache',16], ['Command sans eau',8],
    ['Double expresso',19,['Café double','Double espresso']], ['Emporter sans eau',9],
    ['Sipari',13], ['Nes nes',11,['Café au lait','Café lait']],
    ['Cappuccino',13,['Capuccino']], ['Hot Lotus',17], ['Spisial',11],
    ['Nespresso',15], ['Double Nespresso',16], ['Nescafé',11,[],'nescafe'],
  ],
  Thés: [
    ['Thé à la menthe',11], ['Thé à la menthe sans eau',8], ['Verveine',11], ['Lipton',11],
  ],
  Boissons: [
    ['Chocolat chaud',11], ['Chocolat vinois',18,['Chocolat vinoie']], ['Lait chaud',11],
  ],
  Jus: [
    ['Ananas & orange',25], ['Avocat & banane',25], ['Avocat & orange',25],
    ['Jus de banane',15,['Banan'],'juice-banane'], ['Banane & orange',25], ['Fraise & orange',25],
    ['Jus d’ananas',20], ['Jus d’avocat',20,[],'juice-avocat'],
    ['Jus d’avocat fruits secs',30], ['Jus de banane & pomme',18],
    ['Jus de carotte',15], ['Jus de citron',15,['Jus de limon']],
    ['Jus de cocktails',30], ['Jus de concombre',15], ['Jus de fraise',15],
    ['Jus de kiwi',25], ['Jus de mangue',25,[],'juice-mangue'],
    ['Jus de pomme',15,[],'juice-pomme'], ['Jus d’orange',20,[],'juice-orange'],
    ['Jus dragon',25], ['Lait sirop',16], ['Petit jus d’orange',10],
    ['Pomme & orange',25], ['Zrig',11],
  ],
  Sodas: [
    ['Canette',13,['Canett']], ['Hell Classic',15], ['Lipton Canette',15,['Lipton Canett']],
    ['Limonade',12], ['Oulmès',11,['Oulmas']], ['Oulmès Framboise',12],
    ['Oulmès Mojito',12], ['Oulmès Orange',12], ['Oulmès Tropical',12], ['Red Bull',25],
  ],
  Tajines: [
    ['Grand tajine mixte',60], ['Tajine crevette',40], ['Tajine mixte',45],
    ['Tajine sipia',40], ['Tajine viande hachée',28],
  ],
  Poêles: [
    ['Omelette tomate',25], ['Petit déjeuner traditionnel',28], ['Poêle omelette fromage',27], ['Poêle omelette nature',20],
  ],
  Suppléments: [
    ['Amlou',5], ['Avocat',5,['Avocado']], ['Baguette',2,['Baggett']],
    ['Beurre',5], ['Boule de glace',15,['Boule de galss']], ['Charcuterie',3],
    ['Chofan',7], ['Coocking',10], ['Crème chantilly',5], ['Œuf',3,['Egg']],
    ['Fromage',2,['Fromaj']], ['Huile d’olive',5,['Huile dolive']], ['Jben',5],
    ['Lait de vache',10], ['Madlin',3], ['Miel',5], ['Millefeuille',5],
    ['Mini harcha',5], ['Msamen',3], ['Nutella',2], ['Olive',5],
    ['Pain',2], ['Pain 1/2',1], ['Salade fruit',15], ['Thon',5], ['Yaourt',3],
  ],
};

export function menuNameKey(name) {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/[^a-z0-9]/g, '');
}

export const monalisaMenu = Object.entries(sections).flatMap(([category, items]) =>
  items.map(([name, price, aliases = [], catalogKey]) => ({
    category, name, price: price * 100, catalogKey,
    names: [name, ...aliases].map(menuNameKey),
  })),
);
