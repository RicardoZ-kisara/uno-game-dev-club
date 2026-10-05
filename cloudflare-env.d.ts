declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ROOM_STREAM?: DurableObjectNamespace;
  }
}
