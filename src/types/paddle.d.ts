declare module '@paddlejs-models/ocr' {
  export interface OCRResult {
    text: string;
    confidence: number;
    box: [number, number][];
  }

  export function init(config: {
    detectionModel: string;
    recognitionModel: string;
    useGpu?: boolean;
  }): Promise<void>;

  export function recognize(image: HTMLImageElement): Promise<OCRResult[]>;
}

declare module '@paddlejs/paddlejs-core' {
  interface Env {
    set(type: string): Promise<void>;
  }

  export const env: Env;
} 