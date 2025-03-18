"use client";

import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Button } from '@/components/ui/button';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const processImage = async (file: File) => {
    setIsProcessing(true);
    try {
      // Create image preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Initialize Tesseract worker
      const worker = await createWorker();
      await worker.loadLanguage('jpn');
      await worker.initialize('jpn');
      
      // Perform OCR
      const { data } = await worker.recognize(file);
      
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

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('テキストのコピーに失敗しました:', err);
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
          accept="image/*"
          className="hidden"
        />
        <div className="space-y-4">
          <div className="text-lg text-gray-600">
            ここに画像をドラッグ＆ドロップ
            <br />
            または
            <br />
            クリックして画像を選択
          </div>
          <div className="text-sm text-gray-500">
            対応フォーマット: PNG, JPEG, GIF
          </div>
        </div>
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
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">OCR結果</h3>
            <Button
              onClick={() => copyText(ocrResult.text)}
              variant="outline"
              size="sm"
            >
              全てコピー
            </Button>
          </div>
          <div className="space-y-4">
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
                      onClick={() => copyText(line.text)}
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      コピー
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
      )}
    </div>
  );
} 