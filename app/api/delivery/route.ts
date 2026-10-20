import adapter from '../../../integrations/delivery-worker.mjs';
import {env} from 'cloudflare:workers';
export async function GET(request:Request){return adapter.fetch(request,env);}
