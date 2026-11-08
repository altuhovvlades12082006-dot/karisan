export const languages=['uk','ru','en'];
export function languagePath(path,lang='uk'){
  const clean=path.replace(/^\/(ru|en)(?=\/|$)/,'')||'/';
  return lang==='uk'?clean:'/'+lang+(clean==='/'?'':clean);
}
export const categoryTranslations={
  ru:['Детское','Постельное бельё','Бязь Голд люкс','Страйп сатин','Сатин','Варёный хлопок','Байка','Другие новинки белья','Полотенца','Наматрасники','Одеяла','Новинки','Интересное','Покрывала','Подушки'],
  en:['Children','Bed linen','Gold Lux calico','Stripe satin','Satin','Washed cotton','Flannel','New bed linen','Towels','Mattress protectors','Duvets','New arrivals','Discoveries','Bedspreads','Pillows']
};
export const languageCopy={
  uk:{title:'Мистецтво затишку',description:'Постільна білизна та домашній текстиль Kari-San. Знайдіть свою формулу затишку.',home:'Головна',price:'Ціну уточнюйте',available:'Є в наявності',unavailable:'Немає в наявності',catalog:'До каталогу',choose:'Оберіть розмір та перевірте наявність.',textiles:'Домашній текстиль Kari-San: розміри, актуальні ціни та наявність.',noscript:'Для вибору розміру та додавання в кошик увімкніть JavaScript.'},
  ru:{title:'Искусство уюта',description:'Постельное бельё и домашний текстиль Kari-San. Найдите свою формулу уюта.',home:'Главная',price:'Цену уточняйте',available:'В наличии',unavailable:'Нет в наличии',catalog:'В каталог',choose:'Выберите размер и проверьте наличие.',textiles:'Домашний текстиль Kari-San: размеры, актуальные цены и наличие.',noscript:'Для выбора размера и добавления в корзину включите JavaScript.'},
  en:{title:'The art of comfort',description:'Bed linen and home textiles by Kari-San. Find your own comfort.',home:'Home',price:'Ask for price',available:'In stock',unavailable:'Out of stock',catalog:'Back to collection',choose:'Choose a size and check availability.',textiles:'Kari-San home textiles: sizes, current prices and availability.',noscript:'Enable JavaScript to choose a size and add this item to your basket.'}
};
// Reuse existing translations from catalogue records, not generated product facts.
export function localizedProduct(p,lang){return {...p,uk:p[lang]||p.uk,material:{...p.material,uk:p.material?.[lang]||p.material?.uk},variants:p.variants.map(v=>({...v,uk:v[lang]||v.uk}))};}
