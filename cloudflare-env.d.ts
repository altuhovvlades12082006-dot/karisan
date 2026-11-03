declare namespace Cloudflare {
  interface Env {
    CATALOG_BACKEND?: string;
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    PUBLIC_SITE_URL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_LOGIN_EMAIL?: string;
    ADMIN_PASSWORD_HASH?: string;
    NOVA_POSHTA_API_KEY?:string;
    NOVA_POSHTA_SENDER_CITY_REF?:string;
    UKRPOSHTA_BEARER?:string;
    LIQPAY_MODE?:string;
    LIQPAY_API_VERSION?:string;
    LIQPAY_PUBLIC_KEY?:string;
    LIQPAY_PRIVATE_KEY?:string;
  }
}
