import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

export const MAX_CHAT_ATTACHMENT_BYTES = 6 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENT_CHARS = 12000;
const MAX_CHAT_ATTACHMENT_PAGES = 20;

export type AttachmentSource = 'text' | 'pdf' | 'image';

export type ParsedAttachment = {
  content: string;
  source: AttachmentSource;
  type: string;
};

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.xml', '.yml', '.yaml', '.py', '.java', '.c', '.cpp', '.rs', '.go', '.sh', '.sql', '.log'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

let pdfModulePromise: Promise<typeof import('pdfjs-dist')> | null = null;
let pdfWorkerConfigured = false;
let ocrWorkerPromise: Promise<any> | null = null;
let ocrProgressHandler: ((percent: number) => void) | null = null;

function getLowerName(file: File) {
  return file.name.toLowerCase();
}

async function getPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import('pdfjs-dist');
  }

  const pdfModule = await pdfModulePromise;
  if (!pdfWorkerConfigured) {
    pdfModule.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    pdfWorkerConfigured = true;
  }

  return pdfModule;
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function getOcrWorker(onProgress?: (percent: number) => void) {
  ocrProgressHandler = onProgress || null;

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then(async tesseract => {
      const worker = await tesseract.createWorker('eng', 1, {
        logger: message => {
          if (message.status === 'recognizing text' && ocrProgressHandler) {
            ocrProgressHandler(Math.round(message.progress * 100));
          }
        },
      });

      await worker.setParameters({
        tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      });

      return worker;
    });
  }

  return await ocrWorkerPromise;
}

async function extractPdfText(file: File) {
  const pdfModule = await getPdfModule();
  const pdf = await pdfModule.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const totalPages = Math.min(pdf.numPages, MAX_CHAT_ATTACHMENT_PAGES);
  const chunks: string[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) {
      chunks.push(`Page ${pageNumber}: ${pageText}`);
    }
  }

  return chunks.join('\n\n').trim();
}

async function extractImageText(file: File, onProgress?: (percent: number) => void) {
  const worker = await getOcrWorker(onProgress);
  const imageUrl = await readFileAsDataUrl(file);
  const { data } = await worker.recognize(imageUrl);
  return data.text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function isReadableTextFile(file: File) {
  const lowerName = getLowerName(file);

  return file.type.startsWith('text/')
    || file.type === 'application/json'
    || file.type === 'application/xml'
    || TEXT_EXTENSIONS.some(extension => lowerName.endsWith(extension));
}

export function isPdfFile(file: File) {
  return file.type === 'application/pdf' || getLowerName(file).endsWith('.pdf');
}

export function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.some(extension => getLowerName(file).endsWith(extension));
}

export function isSupportedAttachmentFile(file: File) {
  return isReadableTextFile(file) || isPdfFile(file) || isImageFile(file);
}

export async function parseAttachmentFile(file: File, options?: { onOcrProgress?: (percent: number) => void }) {
  if (isReadableTextFile(file)) {
    return {
      content: (await file.text()).trim(),
      source: 'text' as const,
      type: file.type || 'text/plain',
    } satisfies ParsedAttachment;
  }

  if (isPdfFile(file)) {
    return {
      content: await extractPdfText(file),
      source: 'pdf' as const,
      type: 'application/pdf',
    } satisfies ParsedAttachment;
  }

  if (isImageFile(file)) {
    return {
      content: await extractImageText(file, options?.onOcrProgress),
      source: 'image' as const,
      type: file.type || 'image/*',
    } satisfies ParsedAttachment;
  }

  return null;
}

export function formatAttachmentSize(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}