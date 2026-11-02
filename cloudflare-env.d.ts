declare namespace Cloudflare {
  interface Env {
    PUBLIC_SITE_URL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_LOGIN_EMAIL?: string;
    ADMIN_PASSWORD_HASH?: string;
    NOVA_POSHTA_API_KEY?:string;
    UKRPOSHTA_BEARER?:string;
  }
}
