export type TextChunk = {
  id: number;
  text: string;
};

export type DocumentChunk = TextChunk & {
  page: number;
};

export function chunkText(
  text: string,
  chunkSize = 1500,
  overlap = 300
): TextChunk[] {
  const cleanedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleanedText) {
    return [];
  }

  const chunks: TextChunk[] = [];

  let start = 0;
  let id = 0;

  while (start < cleanedText.length) {
    let end = start + chunkSize;

    if (end < cleanedText.length) {
      const paragraphBreak =
        cleanedText.lastIndexOf("\n\n", end);

      const sentenceBreak =
        cleanedText.lastIndexOf(". ", end);

      if (
        paragraphBreak >
        start + chunkSize * 0.6
      ) {
        end = paragraphBreak;
      } else if (
        sentenceBreak >
        start + chunkSize * 0.6
      ) {
        end = sentenceBreak + 1;
      }
    } else {
      end = cleanedText.length;
    }

    const chunk = cleanedText
      .slice(start, end)
      .trim();

    if (chunk) {
      chunks.push({
        id,
        text: chunk,
      });

      id++;
    }

    if (end >= cleanedText.length) {
      break;
    }

    start = Math.max(
      end - overlap,
      start + 1
    );
  }

  return chunks;
}

/*
  Chunks each page on its own, so every chunk
  belongs to exactly one page. Chunk ids are
  unique across the whole document.
*/
export function chunkPages(
  pages: string[],
  chunkSize = 1500,
  overlap = 300
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];

  let id = 0;

  pages.forEach((pageText, index) => {
    for (const chunk of chunkText(
      pageText,
      chunkSize,
      overlap
    )) {
      chunks.push({
        id: id++,
        text: chunk.text,
        page: index + 1,
      });
    }
  });

  return chunks;
}