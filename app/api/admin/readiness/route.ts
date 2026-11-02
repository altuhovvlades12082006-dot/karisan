import {env} from 'cloudflare:workers';
import {db,guard,json} from '../../../../lib/store';
import {credentialsReady} from '../../../../lib/admin-session';
import {acceptingOrders} from '../../../../lib/crm';
import {usesSupabase,supabaseProducts,supabaseClient} from '../../../../lib/supabase-catalog.mjs';

export async function GET(request:Request){
  try{
    const denied=await guard(request);if(denied)return denied;
    if(usesSupabase(env)){
      const products=await supabaseProducts(env);let storage=false;
      try{await supabaseClient(env)('/storage/v1/bucket/product-images');storage=true;}catch{}
      return json({checkedAt:new Date().toISOString(),checks:[
        {label:'Каталог Supabase',ready:true,detail:`Сайт і ця адмінка читають одну базу Supabase. Активних товарів: ${products.length}.`},
        {label:'Вхід адміністратора',ready:credentialsReady(),detail:'Збережено захищений серверний вхід через пошту і пароль; сесії поки у D1.'},
        {label:'Фото Supabase',ready:storage,detail:storage?'Сховище доступне.':'Перевірте сховище перед завантаженням фото.'},
        {label:'CRM та приймання замовлень',ready:false,detail:'Вимкнено: перенесення CRM і резервування залишків до Supabase ще не завершено. Старі D1-замовлення не змішуються з новим каталогом.'},
        {label:'LiqPay',ready:false,detail:env.LIQPAY_PUBLIC_KEY&&env.LIQPAY_PRIVATE_KEY?'Sandbox-маршрути підготовлено. Міграція 006, HTTPS webhook і реальна тестова транзакція ще потребують перевірки. Реальні платежі заборонено.':'Потрібен бізнес-кабінет LiqPay, sandbox-ключі й HTTPS webhook. Серверні маршрути підготовлено; онлайн-оплата вимкнена.'},
        {label:'Нова пошта',ready:false,detail:env.NOVA_POSHTA_API_KEY?'Ключ задано. Потрібна перевірка справжніх відділень і збереження доставки в замовленні.':'Потрібен кабінет власниці й API-ключ. Пошук відділень вимкнений; вигадані дані не підставляються.'},
        {label:'Укрпошта',ready:false,detail:env.UKRPOSHTA_BEARER?'Bearer задано. Потрібна перевірка справжніх відділень за індексом і доставки в замовленні.':'Потрібен API-доступ за договором власниці. Пошук за індексом вимкнений до підключення bearer.'},
        {label:'Повна резервна копія',ready:false,detail:'Перед публікацією потрібна перевірена копія бази та фотографій.'}
      ]});
    }
    const count=await db().prepare('SELECT COUNT(*) AS total FROM products WHERE archived=0').first<{total:number}>();
    let storage=false;
    try{if(env.BUCKET){await env.BUCKET.list({limit:1});storage=true;}}catch{}
    const orders=await acceptingOrders();
    return json({checkedAt:new Date().toISOString(),checks:[
      {label:'Сервер і база даних',ready:true,detail:`З’єднання перевірено. Активних товарів: ${count?.total??0}.`},
      {label:'Вхід адміністратора',ready:credentialsReady(),detail:'Вхід через пошту та пароль. Дані товарів і замовлень захищені авторизацією.'},
      {label:'Сховище фотографій',ready:storage,detail:storage?'З’єднання зі сховищем перевірено (читання).':'Сховище недоступне. Перевірте підключення перед завантаженням фото.'},
      {label:'Приймання замовлень',ready:orders,detail:orders?'Увімкнено. Перевірте актуальні ціни, залишки та спосіб виконання.':'Вимкнено. У розділі «Замовлення» ввімкніть лише після перевірки цін, залишків і виконання замовлень.'},
      {label:'Онлайн-оплата',ready:false,detail:'Платіжний провайдер ще не підключений. Запис оплати менеджером не є банківським платежем.'},
      {label:'Нова пошта',ready:false,detail:env.NOVA_POSHTA_API_KEY?'Ключ задано, але потрібна наскрізна перевірка доставки.':'Потрібен API-ключ кабінету власниці та перевірка доставки.'},
      {label:'Укрпошта',ready:false,detail:env.UKRPOSHTA_BEARER?'Ключ задано, але потрібна наскрізна перевірка доставки.':'Потрібен API-доступ власниці та перевірка доставки.'},
      {label:'Сповіщення про замовлення',ready:false,detail:'Автоматичні листи та SMS не підключені. Замовлення доступні в адмінці.'},
      {label:'Повна резервна копія',ready:false,detail:'Експорт каталогу і CSV статистики доступні, але не замінюють повну копію CRM та перевірку відновлення.'}
    ]});
  }catch{return json({error:'Не вдалося перевірити готовність. Спробуйте ще раз.'},503);}
}
