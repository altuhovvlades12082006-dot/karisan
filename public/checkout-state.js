// Untrusted API configuration must fail closed; never infer card-payment support.
export function deliveryAvailability(delivery,preferred){
  const available={nova:delivery?.nova===true,ukr:delivery?.ukr===true};
  const selected=available[preferred]?preferred:available.nova?'nova':available.ukr?'ukr':null;
  return {available,selected};
}
export async function loadCheckoutData(fetcher=fetch){
 const responses=await Promise.all(['/api/catalog','/api/commerce'].map(path=>fetcher(path,{cache:'no-store',signal:AbortSignal.timeout(12000)})));
 if(responses.some(r=>!r.ok))throw Error('checkout_unavailable');
 const [catalog,commerce]=await Promise.all(responses.map(r=>r.json()));
 if(!Array.isArray(catalog)||typeof commerce?.orders!=='boolean'||!commerce.delivery)throw Error('checkout_unavailable');
 return {catalog,config:deliveryAvailability(commerce.delivery).available,orderAllowed:commerce.orders===true};
}
export const checkoutMessages={
  uk:{loading:'Завантажуємо оформлення…',failed:'Не вдалося завантажити оформлення. Перевірте з’єднання та спробуйте ще раз.',retry:'Спробувати ще раз',unavailable:'Цей перевізник ще не підключений. Оберіть доступний спосіб доставки.',none:'Доставка поки недоступна. Зв’яжіться з магазином для уточнення.'},
  ru:{loading:'Загружаем оформление…',failed:'Не удалось загрузить оформление. Проверьте соединение и попробуйте ещё раз.',retry:'Попробовать ещё раз',unavailable:'Этот перевозчик ещё не подключён. Выберите доступный способ доставки.',none:'Доставка пока недоступна. Свяжитесь с магазином для уточнения.'},
  en:{loading:'Loading checkout…',failed:'Checkout could not be loaded. Check your connection and try again.',retry:'Try again',unavailable:'This carrier is not connected yet. Choose an available delivery method.',none:'Delivery is not available yet. Contact the shop for assistance.'}
};
