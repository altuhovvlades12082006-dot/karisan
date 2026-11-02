import {storefrontResponse} from '../../../lib/storefront-response';
export async function GET(request:Request,{params}:{params:Promise<{slug:string}>}){return storefrontResponse(request,'category',(await params).slug);}
