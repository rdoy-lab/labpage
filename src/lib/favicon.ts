import https from "node:https";
import http from "node:http";

const insecureAgent = new https.Agent({ rejectUnauthorized: false });
const httpAgent = new http.Agent();

interface FetchResult {
  status: number;
  headers: Headers;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/png,image/*,*/*;q=0.8",
};

const MAX_REDIRECTS = 5;

function fetchUrl(url: string, redirectsLeft = MAX_REDIRECTS): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        agent: url.startsWith("https") ? insecureAgent : httpAgent,
        timeout: 5000,
        headers: REQUEST_HEADERS,
      },
      (res) => {
        const status = res.statusCode || 0;

        // Follow redirects, like a browser does.
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume(); // discard body
          let next: string;
          try {
            next = new URL(res.headers.location, url).toString();
          } catch {
            reject(new Error("invalid redirect location"));
            return;
          }
          resolve(fetchUrl(next, redirectsLeft - 1));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, val] of Object.entries(res.headers)) {
            if (val) headers.set(key, Array.isArray(val) ? val.join(", ") : val);
          }
          resolve({
            status,
            headers,
            arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
            text: () => Promise.resolve(buf.toString("utf-8")),
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
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

    // Match any <link> tag, then filter to icon-bearing rel values. This
    // catches "icon", "shortcut icon", "icon shortcut", "apple-touch-icon",
    // "mask-icon", and copes with rel appearing before or after href.
    const linkRegex = /<link\b[^>]*>/gi;
    const relRegex = /rel=["']([^"']*)["']/i;
    const hrefRegex = /href=["']([^"']+)["']/i;

    const candidates: { href: string; score: number }[] = [];
    const matches = html.match(linkRegex);
    if (matches) {
      for (const tag of matches) {
        const relMatch = tag.match(relRegex);
        if (!relMatch) continue;
        const rel = relMatch[1].toLowerCase();
        const rels = rel.split(/\s+/);
        const isIcon =
          rels.includes("icon") ||
          rels.includes("shortcut") ||
          rel === "apple-touch-icon" ||
          rel === "apple-touch-icon-precomposed" ||
          rel === "mask-icon";
        if (!isIcon) continue;

        const hrefMatch = tag.match(hrefRegex);
        if (!hrefMatch) continue;

        // Prefer standard icons over apple-touch/mask variants.
        let score = 0;
        if (rels.includes("icon")) score += 2;
        if (rels.includes("shortcut")) score += 1;
        candidates.push({ href: hrefMatch[1], score });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const href = candidates[0].href;
      try {
        return new URL(href, origin).toString();
      } catch {
        return `${origin}/favicon.ico`;
      }
    }
  } catch {
    // fall through to default
  }

  return `${origin}/favicon.ico`;
}

function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // ICO / CUR
  if (buf[0] === 0x00 && buf[1] === 0x00 && (buf[2] === 0x01 || buf[2] === 0x02) && buf[3] === 0x00) {
    return "image/x-icon";
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // WEBP (RIFF....WEBP)
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return "image/webp";
  }
  // SVG (text starting with <?xml or <svg)
  const head = buf.subarray(0, 256).toString("utf-8").trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    return "image/svg+xml";
  }
  return null;
}

async function fetchImage(url: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  try {
    const response = await fetchUrl(url);

    if (response.status < 200 || response.status >= 300) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return null;
    }

    const headerType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (headerType.startsWith("image/")) {
      return { body: arrayBuffer, contentType: headerType };
    }

    // Some servers serve icons with a generic or missing content-type
    // (e.g. application/octet-stream). Validate by magic bytes instead.
    const sniffed = sniffImageType(Buffer.from(arrayBuffer));
    if (sniffed) {
      return { body: arrayBuffer, contentType: sniffed };
    }

    return null;
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
      return { url: `${parsed.origin}/favicon.ico`, contentType: image.contentType };
    }
  }

  if (!image) {
    return null;
  }

  return { url: faviconUrl, contentType: image.contentType };
}

export async function fetchFavicon(pageUrl: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const parsed = new URL(pageUrl);

  const faviconUrl = await findFaviconUrl(pageUrl);
  const image = await fetchImage(faviconUrl);

  if (!image && faviconUrl !== `${parsed.origin}/favicon.ico`) {
    const fallback = await fetchImage(`${parsed.origin}/favicon.ico`);
    if (fallback) {
      return { body: fallback.body, contentType: fallback.contentType };
    }
  }

  if (!image) {
    return null;
  }

  return { body: image.body, contentType: image.contentType };
}
