// Local product photos; provenance is in public/products/sources.json.
export const drinkCatalog = [
 ['coca-cola','Coca-Cola','Sodas',10,['Coca-Cola']],
 ['coca-zero','Coca-Cola Zero','Sodas',10,[]],
 ['fanta-orange','Fanta Orange','Sodas',10,[]],
 ['fanta-citron','Fanta Citron','Sodas',10,[]],
 ['fanta-pomme','Fanta Pomme','Sodas',10,[]],
 ['sprite','Sprite','Sodas',10,[]],
 ['sprite-menthe','Sprite Citron Menthe','Sodas',10,[]],
 ['hawai-tropical','Hawaï Tropical','Sodas',10,['Hawaï']],
 ['hawai-ananas','Hawaï Ananas','Sodas',10,[]],
 ['poms','Pom’s','Sodas',10,["Pom’s","Pom's","Poms"]],
 ['schweppes-tonic','Schweppes Tonic','Sodas',10,[]],
 ['schweppes-citron','Schweppes Citron','Sodas',10,[]],
 ['ciel','Ciel','Eaux',7,[]],
 ['cappy-orange','Cappy Orange','Jus en bouteille',15,[]],
 ['nescafe','Nescafé','Cafés',10,['Nescafe','Nascafe']],
].map(([key,name,category,price,aliases])=>({key:String(key),name:String(name),category:String(category),price:Number(price),aliases:/** @type {string[]} */(aliases),image_path:`/products/${key}.webp` }));
// Fresh juices are always orderable; their sales do not consume inventory.
export const juiceCatalog = [
 ['orange','Jus d’orange',['Jus d’orange',"Jus d'orange"]],
 ['panache','Jus panaché',['Panaché','Jus panache']],
 ['avocat','Jus d’avocat',["Jus d'avocat"]],
 ['banane','Jus de banane',[]],
 ['pomme','Jus de pomme',[]],
 ['mangue','Jus de mangue',[]],
].map(([fruit,name,aliases])=>({key:`juice-${fruit}`,name:String(name),category:'Jus',price:15,aliases:/** @type {string[]} */(aliases),image_path:`/products/juice-${fruit}.${['panache','banane','pomme'].includes(fruit)?'webp':'jpg'}`,stock_name:`${name} (portion)`,stock_unit:'portion',stock_tracked:false}));
export const catalogProducts = [...drinkCatalog,...juiceCatalog];
export const coffeePhotos = [
 { name: 'Café noir', aliases: ['Espresso', 'Expresso'], image_path: '/products/cafe-noir.jpg' },
 { name: 'Café double', aliases: ['Double espresso', 'Double expresso'], image_path: '/products/cafe-double.webp' },
 { name: 'Café au lait', aliases: [], image_path: '/products/cafe-lait.jpg' },
];
export const additionalMenuPhotos = [
 { name: 'Cappuccino', category: 'Cafés', image_path: '/products/cappuccino.webp' },
 { name: 'Thé à la menthe', category: 'Thés', image_path: '/products/the-menthe.webp' },
 { name: 'Eau minérale', category: 'Boissons', image_path: '/products/eau-minerale.jpg' },
 { name: 'Lait chaud', category: 'Boissons', image_path: '/products/lait-chaud.webp' },
];
export const productImages = new Set([...catalogProducts, ...coffeePhotos, ...additionalMenuPhotos].map(p=>p.image_path));
