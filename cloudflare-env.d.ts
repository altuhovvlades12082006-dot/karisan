declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ADMIN_LOGIN_EMAIL?: string;
    ADMIN_PASSWORD_HASH?: string;
    NOVA_POSHTA_API_KEY?:string;
    UKRPOSHTA_BEARER?:string;
  }
}
