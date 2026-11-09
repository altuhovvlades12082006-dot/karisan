import {validRef} from '../integrations/nova-poshta.mjs';
import {siteOrigin} from './storefront-seo.mjs';
export function launchConfigurationChecks(env){
 let origin=false;try{if(env.PUBLIC_SITE_URL){siteOrigin('http://localhost',env.PUBLIC_SITE_URL);origin=true;}}catch{}
 return [
  {label:'Нова пошта · налаштування пошуку',ready:!!env.NOVA_POSHTA_API_KEY,detail:env.NOVA_POSHTA_API_KEY?'Серверний ключ задано. Це перевірка конфігурації, не доступності API й не створення ТТН.':'Серверний ключ не задано. Пошук недоступний; ключ не можна додавати в код браузера.'},
  {label:'Нова пошта · місто відправлення',ready:validRef(env.NOVA_POSHTA_SENDER_CITY_REF),detail:validRef(env.NOVA_POSHTA_SENDER_CITY_REF)?'Ref міста задано. Для реального розрахунку потрібні вага/габарити запакованих товарів; для ТТН — дані відправника.':'Потрібен Ref фактичного міста відправлення для розрахунку доставки.'},
  {label:'Домен · canonical та sitemap',ready:origin,detail:origin?'HTTPS-адресу задано. Доступність домену, сертифікат, robots і sitemap потрібно перевірити після розміщення.':'PUBLIC_SITE_URL не задано або некоректний. Зараз SEO використовує адресу поточного перегляду, а не підтверджений production-домен.'}
 ];
}
