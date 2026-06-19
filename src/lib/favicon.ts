import https from "node:https";
import http from "node:http";
import logger from "./logger";

const log = logger.child({ module: "favicon" });

const insecureAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();

interface FetchResult {
  status: number;
  headers: Headers;
  url: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

function fetchUrl(url: string, maxRedirects = 5): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { agent: url.startsWith("https") ? insecureAgent : httpAgent, timeout: 5000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [key, val] of Object.entries(res.headers)) {
          if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
        }

        const status = res.statusCode || 0;
        if (maxRedirects > 0 && status >= 300 && status < 400) {
          const location = res.headers.location;
          if (location) {
            const redirectUrl = location.startsWith("http") ? location : new URL(location, url).toString();
            resolve(fetchUrl(redirectUrl, maxRedirects - 1));
            return;
          }
        }

        resolve({
          status,
          headers,
          url,
          arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
          text: () => Promise.resolve(buf.toString("utf-8")),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function findFaviconUrl(pageUrl: string): Promise<string> {
  const parsed = new URL(pageUrl);
  const origin = parsed.origin;

  try {
    const response = await fetchUrl(origin);

    if (response.status < 200 || response.status >= 300) {
      return `${origin}/favicon.ico`;
    }

    const html = await response.text();
    const linkRegex = /<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*>/gi;
    const hrefRegex = /href=["']([^"']+)["']/i;

    const matches = html.match(linkRegex);
    if (matches) {
      for (const tag of matches) {
        const hrefMatch = tag.match(hrefRegex);
        if (hrefMatch) {
          const href = hrefMatch[1];
          if (href.startsWith("http")) return href;
          const base = new URL(response.url);
          const resolved = new URL(href, base);
          return resolved.toString();
        }
      }
    }
  } catch {
    // fall through to default
  }

  return `${origin}/favicon.ico`;
}

async function fetchImage(url: string) {
  try {
    const response = await fetchUrl(url);

    if (response.status < 200 || response.status >= 300) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return null;
    }

    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function checkFavicon(pageUrl: string): Promise<{ url: string; contentType: string } | null> {
  const parsed = new URL(pageUrl);

  const faviconUrl = await findFaviconUrl(pageUrl);
  let image = await fetchImage(faviconUrl);

  if (!image && faviconUrl !== `${parsed.origin}/favicon.ico`) {
    image = await fetchImage(`${parsed.origin}/favicon.ico`);
    if (image) {
      return { url: `${parsed.origin}/favicon.ico`, contentType: "image/x-icon" };
    }
  }

  if (!image) {
    return null;
  }

  return { url: faviconUrl, contentType: "image/x-icon" };
}

export async function fetchFavicon(pageUrl: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const parsed = new URL(pageUrl);

  const faviconUrl = await findFaviconUrl(pageUrl);
  log.debug({ pageUrl, faviconUrl }, "Fetching favicon");
  const image = await fetchImage(faviconUrl);

  if (!image && faviconUrl !== `${parsed.origin}/favicon.ico`) {
    const fallback = await fetchImage(`${parsed.origin}/favicon.ico`);
    if (fallback) {
      return { body: fallback, contentType: "image/x-icon" };
    }
  }

  if (!image) {
    log.debug({ pageUrl }, "No favicon found");
    return null;
  }

  return { body: image, contentType: "image/x-icon" };
}
