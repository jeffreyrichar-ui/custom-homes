export type ScrapeResult = {
  imageBuffer: Buffer;
  contentType: string;
  sourceUrl: string;
};

export type Scraper = {
  brand: string; // canonical brand name
  matches(brand: string): boolean; // case-insensitive matcher; accepts variations
  scrape(sku: string): Promise<ScrapeResult | null>;
};

export class ScrapeError extends Error {
  public override cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}
