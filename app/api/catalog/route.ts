import {catalog,json} from '../../../lib/store';
export async function GET(){try{return json(await catalog());}catch{return json({error:'Каталог тимчасово недоступний'},503);}}
