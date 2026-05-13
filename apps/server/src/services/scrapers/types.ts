export type ScrapeInput = {
  brand: string;
  sku?: string | null;
  style?: string | null;
  color?: string | null;
};

export type ScrapeResult = {
  imageBuffer: Buffer;
  contentType: string;
  sourceUrl: string;
};

export type Scraper = {
  brand: string; // canonical brand/manufacturer name
  matches(brand: string): boolean;
  scrape(input: ScrapeInput): Promise<ScrapeResult | null>;
};

export class ScrapeError extends Error {
  public override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/** Build a search query string from the available input. */
export function searchQuery(input: ScrapeInput): string {
  return [input.sku, input.style, input.color]
    .filter(Boolean)
    .join(" ")
    .trim();
}
