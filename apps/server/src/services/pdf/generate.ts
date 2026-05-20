import puppeteer, { type Browser } from "puppeteer";

let cached: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!cached) {
    cached = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return cached;
}

export type PdfFooterOptions = {
  /** Project name shown bottom-left. */
  projectName?: string;
  /** Trade or "Full Selections" shown bottom-center. */
  centerLabel?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Header/footer templates run in their own micro-DOM and need fully inline
 * styles. Puppeteer recognises a small set of <span class="..."> tokens
 * like pageNumber, totalPages, title, date, url — we use pageNumber and
 * totalPages for "Page X of Y" in the footer.
 *
 * The footer is suppressed on the first (cover) page because we set
 * `displayFooter: false` on it via CSS print rules... actually Puppeteer
 * doesn't support per-page header toggling cleanly, so we instead use a
 * `.first-page` style hook combined with print CSS — see footerTemplate
 * below. We rely on the cover having its own visual footer ("prepared
 * for…") and accept the running footer through all pages — print best
 * practice for a spec book.
 */
function buildFooterTemplate(opts: PdfFooterOptions): string {
  const left = opts.projectName ? escapeHtml(opts.projectName) : "";
  const center = opts.centerLabel ? escapeHtml(opts.centerLabel) : "";
  return `<div style="
    width: 100%;
    padding: 0 0.5in;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 8.5px;
    color: #8f897e;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
  ">
    <div style="flex: 1 1 0; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${left}</div>
    <div style="flex: 1 1 0; text-align: center; color: #c9c0b1;">${center}</div>
    <div style="flex: 1 1 0; text-align: right;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>`;
}

export async function htmlToPdf(
  html: string,
  footer?: PdfFooterOptions,
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const displayHeaderFooter = Boolean(footer);
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter,
      // Empty header keeps top margin clean; the cover renders its own visual top.
      headerTemplate: displayHeaderFooter ? `<div></div>` : undefined,
      footerTemplate: displayHeaderFooter ? buildFooterTemplate(footer!) : undefined,
      margin: displayHeaderFooter
        ? { top: "0.5in", bottom: "0.6in", left: "0.5in", right: "0.5in" }
        : { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

export async function closePdfBrowser(): Promise<void> {
  if (!cached) return;
  const b = await cached;
  cached = null;
  await b.close();
}
