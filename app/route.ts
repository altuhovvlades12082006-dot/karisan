import {storefrontResponse} from '../lib/storefront-response';
export function GET(request:Request) { return storefrontResponse(request,'home'); }
