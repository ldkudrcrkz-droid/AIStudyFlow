import pdf from "pdf-parse";

export async function extractPdfPages(
  buffer: Buffer
): Promise<string[]> {
  const pages: string[] = [];

  async function renderPage(pageData: any): Promise<string> {
    const content = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });

    let lastY: number | undefined;
    let text = "";

    for (const item of content.items) {
      const y = item.transform[5];

      if (lastY === undefined || lastY === y) {
        text += item.str;
      } else {
        text += "\n" + item.str;
      }

      lastY = y;
    }

    pages[pageData.pageNumber - 1] = text;

    return text;
  }

  await pdf(buffer, { pagerender: renderPage });

  // Fill any gaps so the array has no holes
  return Array.from(pages, (page) => page ?? "");
}