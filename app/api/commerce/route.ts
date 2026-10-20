import {env} from 'cloudflare:workers';
import {acceptingOrders} from '../../../lib/crm';
export async function GET(){const orders=await acceptingOrders();return Response.json({delivery:{nova:!!env.NOVA_POSHTA_API_KEY,ukr:!!env.UKRPOSHTA_BEARER},payments:{cod:orders,card:false},orders},{headers:{'Cache-Control':'no-store'}});}
