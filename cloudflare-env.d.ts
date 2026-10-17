declare namespace Cloudflare {
  interface Env {
    OWNER_USER_ID?: string;
    PUBLISHER_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
