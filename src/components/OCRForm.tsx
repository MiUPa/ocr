"use client";

import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface OCRResult {
  text: string;
  confidence: number;
}

export function OCRForm() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const worker = await createWorker('jpn');
      
      // Perform OCR
      const { data } = await worker.recognize(file);
      
      setOcrResult({
        text: data.text,
        confidence: data.confidence
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

      {/* プレビューと結果表示 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 画像プレビュー */}
        {imagePreview && (
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h3 className="text-lg font-semibold mb-4">アップロード画像</h3>
            <div className="relative aspect-[4/3]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Preview"
                className="object-contain w-full h-full"
              />
            </div>
          </div>
        )}

        {/* OCR結果 */}
        {isProcessing ? (
          <div className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">OCR処理中...</p>
            </div>
          </div>
        ) : ocrResult && (
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
            <div className="bg-gray-50 p-4 rounded space-y-2">
              {ocrResult.text.split('\n').map((line, index) => (
                line.trim() && (
                  <div
                    key={index}
                    className="flex items-center justify-between group hover:bg-blue-50 p-2 rounded transition-colors"
                  >
                    <span className="text-sm whitespace-pre-wrap flex-1">{line}</span>
                    <Button
                      onClick={() => copyText(line)}
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      コピー
                    </Button>
                  </div>
                )
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              認識精度: {ocrResult.confidence.toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
} 