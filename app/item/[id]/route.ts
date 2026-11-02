import {storefrontResponse} from '../../../lib/storefront-response';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){return storefrontResponse(request,'item',(await params).id);}
