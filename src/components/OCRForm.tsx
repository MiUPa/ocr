"use client";

import { useState, useRef } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import { Button } from '@/components/ui/button';
import * as pdfjsLib from 'pdfjs-dist';

// PDFワーカーの設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface OCRResult {
  text: string;
  confidence: number;
  lines: {
    text: string;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }[];
}

export function OCRForm() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isHandwrittenMode, setIsHandwrittenMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const convertPDFToImage = async (file: File): Promise<File> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    setTotalPages(pdf.numPages);
    
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context is null');

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Failed to convert PDF to image');
        const imageFile = new File([blob], 'converted-pdf-page.png', { type: 'image/png' });
        resolve(imageFile);
      }, 'image/png');
    });
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    try {
      const imageFile = file.type === 'application/pdf' 
        ? await convertPDFToImage(file)
        : file;

      // Create image preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(imageFile);

      // Initialize Tesseract worker with optimized settings
      const worker = await createWorker();
      await worker.loadLanguage('jpn');
      await worker.initialize('jpn');

      // Configure Tesseract for better handwriting recognition
      await worker.setParameters({
        tessedit_pageseg_mode: isHandwrittenMode ? PSM.SPARSE_TEXT : PSM.AUTO, // SPARSE_TEXT: 手書き文字向け, AUTO: 印刷文字向け
        preserve_interword_spaces: '1'
      });
      
      // Perform OCR
      const { data } = await worker.recognize(imageFile);
      
      // Extract lines with their bounding boxes
      const lines = data.lines || [];
      const processedLines = lines.map(line => ({
        text: line.text,
        bbox: {
          x0: line.bbox.x0,
          y0: line.bbox.y0,
          x1: line.bbox.x1,
          y1: line.bbox.y1
        }
      }));

      setOcrResult({
        text: data.text,
        confidence: data.confidence,
        lines: processedLines
      });

      await worker.terminate();
    } catch (error) {
      console.error('OCR処理中にエラーが発生しました:', error);
      alert(error instanceof Error ? error.message : 'OCR処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      processImage(file);
    }
  };

  const copyText = async (text: string, index?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof index === 'number') {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
    } catch (err) {
      console.error('テキストのコピーに失敗しました:', err);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (fileInputRef.current?.files?.[0] && newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      await processImage(fileInputRef.current.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* アップロードエリア */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors bg-white"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*,.pdf"
          className="hidden"
        />
        <div className="space-y-4">
          <div className="text-lg text-gray-600">
            ここに画像またはPDFをドラッグ＆ドロップ
            <br />
            または
            <br />
            クリックして選択
          </div>
          <div className="text-sm text-gray-500">
            対応フォーマット: PNG, JPEG, GIF, PDF
          </div>
        </div>
      </div>

      {/* 認識モード切り替え */}
      <div className="flex items-center justify-end space-x-2">
        <span className="text-sm text-gray-600">認識モード:</span>
        <Button
          onClick={() => setIsHandwrittenMode(!isHandwrittenMode)}
          variant={isHandwrittenMode ? "secondary" : "outline"}
          size="sm"
        >
          {isHandwrittenMode ? "手書き文字" : "印刷文字"}
        </Button>
      </div>

      {/* OCR結果表示 */}
      {isProcessing ? (
        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">OCR処理中...</p>
          </div>
        </div>
      ) : ocrResult && imagePreview && (
        <div className="grid grid-cols-2 gap-6">
          {/* 元の画像表示 */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">元の画像</h3>
              {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    variant="outline"
                    size="sm"
                  >
                    前のページ
                  </Button>
                  <span className="text-sm text-gray-600">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    variant="outline"
                    size="sm"
                  >
                    次のページ
                  </Button>
                </div>
              )}
            </div>
            <div className="relative w-full aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Original document"
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* OCR結果表示 */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">OCR結果</h3>
              <Button
                onClick={() => copyText(ocrResult.text)}
                variant="outline"
                size="sm"
                className="min-w-[100px]"
              >
                全てコピー
              </Button>
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {ocrResult.lines.map((line, index) => (
                line.text.trim() && (
                  <div
                    key={index}
                    className="flex items-start space-x-4 p-2 hover:bg-gray-50 rounded-lg group"
                  >
                    {/* 切り抜き画像表示エリア */}
                    <div className="w-1/3 relative">
                      <div className="aspect-[4/1] relative overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          ref={imageRef}
                          src={imagePreview}
                          alt={`Line ${index + 1}`}
                          className="absolute"
                          style={{
                            clipPath: `polygon(${line.bbox.x0}px ${line.bbox.y0}px, ${line.bbox.x1}px ${line.bbox.y0}px, ${line.bbox.x1}px ${line.bbox.y1}px, ${line.bbox.x0}px ${line.bbox.y1}px)`,
                            top: `-${line.bbox.y0}px`,
                            left: `-${line.bbox.x0}px`,
                            width: '100%',
                            height: 'auto'
                          }}
                        />
                      </div>
                    </div>
                    {/* テキストとコピーボタン */}
                    <div className="flex-1 flex items-center justify-between min-h-[2rem]">
                      <span className="text-sm whitespace-pre-wrap">{line.text}</span>
                      <Button
                        onClick={() => copyText(line.text, index)}
                        variant={copiedIndex === index ? "secondary" : "ghost"}
                        size="sm"
                        className="min-w-[80px] transition-all duration-200"
                      >
                        {copiedIndex === index ? "コピー完了!" : "コピー"}
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-600">
              認識精度: {ocrResult.confidence.toFixed(2)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
