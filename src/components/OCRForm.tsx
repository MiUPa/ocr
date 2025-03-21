"use client";

import { useState, useRef, useEffect } from 'react';
import { createWorker, PSM, OEM } from 'tesseract.js';
import { Button } from '../components/ui/button';
import * as pdfjsLib from 'pdfjs-dist';
import * as tf from '@tensorflow/tfjs';

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
    imageSrc?: string; // 切り出した画像のデータURL
  }[];
}

// OCR要素の共通インターフェースを定義
interface OCRElement {
  text: string;
  bbox?: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

// 学習データの型定義
interface TrainingData {
  imageSrc: string;
  originalText: string;
  correctedText: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export function OCRForm() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [originalImagePreview, setOriginalImagePreview] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isHandwrittenMode, setIsHandwrittenMode] = useState(true);
  const [trainingData, setTrainingData] = useState<TrainingData[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [trainProgress, setTrainProgress] = useState(0);
  const [isEditing, setIsEditing] = useState<Record<number, boolean>>({});
  const [editedText, setEditedText] = useState<Record<number, string>>({});
  const [model, setModel] = useState<tf.LayersModel | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const originalImageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // TensorFlowモデルの作成と学習のための関数
  useEffect(() => {
    // localStorageから保存されていた学習データを読み込む
    const savedTrainingData = localStorage.getItem('ocrTrainingData');
    if (savedTrainingData) {
      setTrainingData(JSON.parse(savedTrainingData));
    }

    // モデルをロードする（存在する場合）
    const loadSavedModel = async () => {
      try {
        const savedModel = await tf.loadLayersModel('indexeddb://ocr-correction-model');
        setModel(savedModel);
        setModelLoaded(true);
        console.log('保存されたモデルをロードしました');
      } catch (loadError) {
        console.log('保存されたモデルはありません。新しいモデルを作成します。');
        createNewModel();
      }
    };

    // 新しいモデルを作成
    const createNewModel = () => {
      const newModel = tf.sequential();
      
      // 文字エンベディングのための入力層
      newModel.add(tf.layers.embedding({
        inputDim: 10000, // 語彙サイズ
        outputDim: 64,
        inputLength: 20 // 入力テキストの最大長
      }));
      
      // LSTM層
      newModel.add(tf.layers.lstm({
        units: 64,
        returnSequences: true
      }));
      
      // 双方向LSTM層
      newModel.add(tf.layers.bidirectional({
        layer: tf.layers.lstm({ units: 32 }),
        mergeMode: 'concat'
      }));
      
      // 出力層
      newModel.add(tf.layers.dense({
        units: 10000, // 語彙サイズと同じ
        activation: 'softmax'
      }));
      
      // モデルをコンパイル
      newModel.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      setModel(newModel);
      setModelLoaded(true);
      console.log('新しいモデルを作成しました');
    };

    loadSavedModel();
  }, []);

  // テキストをトークン化する関数
  const tokenizeText = (text: string, maxLength: number = 20): number[] => {
    // 非常に単純なトークン化（文字単位）
    const tokens = Array.from(text).map(char => char.charCodeAt(0) % 10000);
    
    // パディング
    while (tokens.length < maxLength) {
      tokens.push(0);
    }
    
    // 切り詰め
    return tokens.slice(0, maxLength);
  };

  // トークンをテキストに戻す関数
  const detokenizeText = (tokens: number[]): string => {
    return tokens
      .filter(token => token > 0)
      .map(token => String.fromCharCode(token))
      .join('');
  };

  // 学習データの準備
  const prepareTrainingData = (trainingData: TrainingData[]) => {
    if (trainingData.length === 0) return null;
    
    const maxLength = 20;
    const inputs: number[][] = [];
    const outputs: number[][] = [];
    
    trainingData.forEach(item => {
      const inputTokens = tokenizeText(item.originalText, maxLength);
      const outputTokens = tokenizeText(item.correctedText, maxLength);
      
      inputs.push(inputTokens);
      outputs.push(outputTokens);
    });
    
    // TensorFlow形式に変換
    const inputTensor = tf.tensor2d(inputs, [inputs.length, maxLength]);
    const outputTensor = tf.tensor2d(outputs, [outputs.length, maxLength]);
    
    return {
      inputs: inputTensor,
      outputs: outputTensor
    };
  };

  // 実際のモデル学習関数
  const startTraining = async () => {
    if (!model || trainingData.length === 0) {
      alert('学習データがないか、モデルが読み込まれていません');
      return;
    }
    
    setIsTraining(true);
    setTrainProgress(0);
    
    try {
      // 学習データの準備
      const trainData = prepareTrainingData(trainingData);
      if (!trainData) {
        throw new Error('学習データの準備に失敗しました');
      }
      
      // 学習の実行
      await model.fit(trainData.inputs, trainData.outputs, {
        epochs: 10,
        batchSize: Math.max(1, Math.floor(trainingData.length / 4)),
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            const progress = Math.round(((epoch + 1) / 10) * 100);
            setTrainProgress(progress);
            console.log(`エポック ${epoch + 1}/10, 損失: ${logs?.loss}, 精度: ${logs?.acc}`);
          }
        }
      });
      
      // モデルの保存
      await model.save('indexeddb://ocr-correction-model');
      
      alert('テキスト修正データの学習が完了しました！\n今後のOCR処理に反映されます。');
    } catch (error) {
      console.error('学習中にエラーが発生しました:', error);
      alert(error instanceof Error ? error.message : '学習中にエラーが発生しました。');
    } finally {
      setIsTraining(false);
      setTrainProgress(100);
      
      // 解放
      try {
        if (trainData) {
          trainData.inputs.dispose();
          trainData.outputs.dispose();
        }
      } catch (disposeError) {
        console.error('リソース解放中にエラーが発生しました:', disposeError);
      }
    }
  };

  // モデルを使用してテキストを修正する関数
  const correctText = async (text: string): Promise<string> => {
    if (!model || !modelLoaded) return text;
    
    // 既知の修正パターンを確認
    const exactMatch = trainingData.find(item => item.originalText === text);
    if (exactMatch) {
      return exactMatch.correctedText;
    }
    
    try {
      // トークン化
      const tokens = tokenizeText(text);
      const inputTensor = tf.tensor2d([tokens], [1, tokens.length]);
      
      // 予測
      const prediction = model.predict(inputTensor) as tf.Tensor;
      const predictionData = await prediction.array() as number[][];
      
      // 予測結果を取得
      const predictedTokens = predictionData[0].map((prob, i) => {
        // 確率が十分高い場合のみトークンを置き換える
        return prob > 0.7 ? i : tokens[i % tokens.length];
      });
      
      // テキストに戻す
      const correctedText = detokenizeText(predictedTokens);
      
      // リソース解放
      inputTensor.dispose();
      prediction.dispose();
      
      return correctedText;
    } catch (error) {
      console.error('テキスト修正中にエラーが発生しました:', error);
      return text; // エラーの場合は元のテキストを返す
    }
  };

  // 画像前処理関数
  const preprocessImage = async (imageFile: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Canvasの作成
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas context is null');

        // 高解像度で処理（DPI調整）
        const scale = Math.max(2, Math.min(2000 / img.width, 2000 / img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 画像の描画
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        // 画像処理の適用
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // グレースケール化
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // コントラスト調整
        ctx.filter = 'contrast(1.2) brightness(1.1)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        
        canvas.toBlob((blob) => {
          if (!blob) throw new Error('Failed to convert canvas to blob');
          const processedFile = new File([blob], 'preprocessed-image.png', { type: 'image/png' });
          resolve(processedFile);
        }, 'image/png', 1.0);
      };

      img.src = URL.createObjectURL(imageFile);
    });
  };

  // PDFを画像に変換
  const convertPDFToImage = async (file: File): Promise<File> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    setTotalPages(pdf.numPages);
    
    const page = await pdf.getPage(currentPage);
    const viewport = page.getViewport({ scale: 2.0 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context is null');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert PDF to image'));
          return;
        }
        const convertedImage = new File([blob], 'converted-pdf.png', { type: 'image/png' });
        resolve(convertedImage);
      }, 'image/png');
    });
  };

  // テキスト領域検出処理
  const detectTextRegions = async (imageFile: File): Promise<{
    regions: Array<{
      bbox: { x0: number; y0: number; x1: number; y1: number };
      imageSrc: string;
    }>;
    fullImageSrc: string;
  }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 元画像のデータURLを保存
        const fullImageCanvas = document.createElement('canvas');
        const fullCtx = fullImageCanvas.getContext('2d');
        
        if (!fullCtx) throw new Error('Canvas context is null');
        
        fullImageCanvas.width = img.width;
        fullImageCanvas.height = img.height;
        fullCtx.drawImage(img, 0, 0);
        
        const fullImageSrc = fullImageCanvas.toDataURL('image/png');
        
        // Canvasの作成
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas context is null');

        // 高解像度で処理（DPI調整）
        const scale = Math.max(2, Math.min(2000 / img.width, 2000 / img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // 画像の描画
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // リセット

        // グレースケール化して二値化（テキスト検出用）
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // グレースケール化
        for (let i = 0; i < data.length; i += 4) {
          const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // 大津の二値化法でテキスト領域を強調
        const processedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pData = processedData.data;
        
        // ヒストグラム作成
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < pData.length; i += 4) {
          histogram[pData[i]]++;
        }
        
        // 最適な閾値を求める
        let sum = 0;
        for (let i = 0; i < 256; i++) {
          sum += i * histogram[i];
        }
        
        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let maxVariance = 0;
        let threshold = 0;
        const total = pData.length / 4;
        
        for (let t = 0; t < 256; t++) {
          wB += histogram[t];
          if (wB === 0) continue;
          
          wF = total - wB;
          if (wF === 0) break;
          
          sumB += t * histogram[t];
          
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          
          const variance = wB * wF * Math.pow(mB - mF, 2);
          
          if (variance > maxVariance) {
            maxVariance = variance;
            threshold = t;
          }
        }
        
        // 二値化
        for (let i = 0; i < pData.length; i += 4) {
          const value = pData[i] < threshold ? 0 : 255;
          pData[i] = pData[i + 1] = pData[i + 2] = value;
        }
        
        ctx.putImageData(processedData, 0, 0);
        
        // 連結成分分析でテキスト領域を検出
        const binarized = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const binData = binarized.data;
        
        // ラベリング用の2次元配列
        const labels: number[][] = Array.from(
          { length: canvas.height },
          () => Array(canvas.width).fill(0)
        );
        
        // 連結成分ラベリング
        let nextLabel = 1;
        const equivalences: Record<number, number> = {};
        
        // 1パス目: ラベル付けと等価関係の記録
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            
            // 背景はスキップ
            if (binData[idx] === 255) continue;
            
            // 周囲のラベルを確認
            const neighbors: number[] = [];
            
            if (x > 0 && binData[idx - 4] === 0) {
              neighbors.push(labels[y][x - 1]); // 左
            }
            
            if (y > 0 && binData[(y - 1) * canvas.width * 4 + x * 4] === 0) {
              neighbors.push(labels[y - 1][x]); // 上
            }
            
            if (x > 0 && y > 0 && binData[(y - 1) * canvas.width * 4 + (x - 1) * 4] === 0) {
              neighbors.push(labels[y - 1][x - 1]); // 左上
            }
            
            if (x < canvas.width - 1 && y > 0 && binData[(y - 1) * canvas.width * 4 + (x + 1) * 4] === 0) {
              neighbors.push(labels[y - 1][x + 1]); // 右上
            }
            
            // 隣接するラベルがない場合は新しいラベルを割り当て
            if (neighbors.length === 0) {
              labels[y][x] = nextLabel++;
              continue;
            }
            
            // 隣接するラベルのうち最小のものを使用
            const minLabel = Math.min(...neighbors.filter(l => l > 0));
            labels[y][x] = minLabel;
            
            // 等価関係を記録
            neighbors.forEach(n => {
              if (n > 0 && n !== minLabel) {
                equivalences[n] = minLabel;
              }
            });
          }
        }
        
        // 等価クラスの解決
        const resolveLabel = (label: number): number => {
          if (label === 0) return 0;
          
          let curr = label;
          while (equivalences[curr] && equivalences[curr] !== curr) {
            curr = equivalences[curr];
          }
          
          return curr;
        };
        
        // 2パス目: 等価関係に基づいてラベルを更新
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (labels[y][x] > 0) {
              labels[y][x] = resolveLabel(labels[y][x]);
            }
          }
        }
        
        // ラベルごとにバウンディングボックスを計算
        const boxes: Record<number, { minX: number; minY: number; maxX: number; maxY: number }> = {};
        
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const label = labels[y][x];
            if (label === 0) continue;
            
            if (!boxes[label]) {
              boxes[label] = { minX: x, minY: y, maxX: x, maxY: y };
            } else {
              boxes[label].minX = Math.min(boxes[label].minX, x);
              boxes[label].minY = Math.min(boxes[label].minY, y);
              boxes[label].maxX = Math.max(boxes[label].maxX, x);
              boxes[label].maxY = Math.max(boxes[label].maxY, y);
            }
          }
        }
        
        // 十分な大きさのボックスのみを選択
        const minArea = 400; // 最小面積（ノイズ除去用）
        const significantBoxes = Object.values(boxes).filter(box => {
          const width = box.maxX - box.minX;
          const height = box.maxY - box.minY;
          return width * height > minArea;
        });
        
        // 近接したボックスをマージ
        const mergeBoxes = (boxes: typeof significantBoxes): typeof significantBoxes => {
          if (boxes.length <= 1) return boxes;
          
          const result = [...boxes];
          let merged = true;
          
          while (merged) {
            merged = false;
            
            for (let i = 0; i < result.length; i++) {
              for (let j = i + 1; j < result.length; j++) {
                const box1 = result[i];
                const box2 = result[j];
                
                // 2つのボックスが近接しているかチェック
                const distance = 30; // ボックス間の最大距離
                
                const isClose = 
                  (box1.minX - distance <= box2.maxX && box1.maxX + distance >= box2.minX) &&
                  (box1.minY - distance <= box2.maxY && box1.maxY + distance >= box2.minY);
                
                if (isClose) {
                  // ボックスをマージ
                  box1.minX = Math.min(box1.minX, box2.minX);
                  box1.minY = Math.min(box1.minY, box2.minY);
                  box1.maxX = Math.max(box1.maxX, box2.maxX);
                  box1.maxY = Math.max(box1.maxY, box2.maxY);
                  
                  // マージされたボックスを削除
                  result.splice(j, 1);
                  merged = true;
                  break;
                }
              }
              
              if (merged) break;
            }
          }
          
          return result;
        };
        
        const mergedBoxes = mergeBoxes(significantBoxes);
        
        // バウンディングボックスを元の画像スケールに戻す
        const scaledBoxes = mergedBoxes.map(box => {
          // スケール考慮して少し余裕を持たせる
          const padding = 10; // パディング
          return {
            bbox: {
              x0: Math.max(0, Math.floor(box.minX / scale) - padding),
              y0: Math.max(0, Math.floor(box.minY / scale) - padding),
              x1: Math.min(img.width, Math.ceil(box.maxX / scale) + padding),
              y1: Math.min(img.height, Math.ceil(box.maxY / scale) + padding)
            }
          };
        });
        
        // 各領域の画像を切り出す
        const regions = scaledBoxes.map(region => {
          const { x0, y0, x1, y1 } = region.bbox;
          const width = x1 - x0;
          const height = y1 - y0;
          
          const regionCanvas = document.createElement('canvas');
          const regionCtx = regionCanvas.getContext('2d');
          
          if (!regionCtx) throw new Error('Region canvas context is null');
          
          regionCanvas.width = width;
          regionCanvas.height = height;
          
          regionCtx.drawImage(
            img,
            x0, y0, width, height,
            0, 0, width, height
          );
          
          return {
            bbox: region.bbox,
            imageSrc: regionCanvas.toDataURL('image/png')
          };
        });
        
        resolve({ regions, fullImageSrc });
      };
      
      img.src = URL.createObjectURL(imageFile);
    });
  };

  // Tesseractによる認識の実行
  const recognizeWithTesseract = async (imageFile: File): Promise<OCRResult> => {
    // Tesseract workerの初期化
    const worker = await createWorker();
    await worker.loadLanguage('jpn');
    await worker.initialize('jpn');
    
    // パラメータ設定 - 日本語向け最適化
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_ocr_engine_mode: OEM.LSTM_ONLY,
      tessjs_create_hocr: '1',
      preserve_interword_spaces: '1',
    });

    // 認識実行
    const { data } = await worker.recognize(imageFile);
    
    // 認識結果を処理
    const lines = data.lines || [];
    const words = data.words || [];
    
    // 認識されたすべての要素を結合して処理
    let allElements: OCRElement[] = [...lines];

    // ラインが不足している場合はワードレベルの情報を追加
    if (lines.length === 0 && words && words.length > 0) {
      allElements = [...allElements, ...words as OCRElement[]];
    }

    // バウンディングボックス情報を正規化して処理
    const processedLines = allElements
      .filter(element => element.text && element.text.trim().length > 0)
      .map(element => {
        // バウンディングボックスが存在しない場合は仮の値を設定
        const bbox = element.bbox || { x0: 0, y0: 0, x1: 100, y1: 50 };
        return {
          text: element.text.trim(),
          bbox: {
            x0: bbox.x0,
            y0: bbox.y0,
            x1: bbox.x1,
            y1: bbox.y1
          }
        };
      })
      // 重複を排除（同じ座標に複数の要素がある場合）
      .filter((item, index, self) => {
        return index === self.findIndex(t => 
          t.bbox.x0 === item.bbox.x0 && 
          t.bbox.y0 === item.bbox.y0 && 
          t.text === item.text
        );
      })
      // Y座標でソート（上から下へ）
      .sort((a, b) => a.bbox.y0 - b.bbox.y0)
      // 空の行を除外
      .filter(line => line.text.length > 0);

    const result: OCRResult = {
      text: processedLines.map(line => line.text).join('\n'),
      confidence: data.confidence,
      lines: processedLines
    };

    await worker.terminate();
    return result;
  };

  // メイン処理関数
  const processImage = async (file: File) => {
    setIsProcessing(true);
    try {
      const imageFile = file.type === 'application/pdf' 
        ? await convertPDFToImage(file)
        : file;

      // 元の画像をプレビュー用に設定
      const originalReader = new FileReader();
      originalReader.onloadend = () => {
        setOriginalImagePreview(originalReader.result as string);
      };
      originalReader.readAsDataURL(imageFile);

      // テキスト領域を検出
      const { regions, fullImageSrc } = await detectTextRegions(imageFile);
      
      // 各領域ごとにOCR処理
      const regionResults = await Promise.all(
        regions.map(async region => {
          // データURLからBlobを作成
          const response = await fetch(region.imageSrc);
          const blob = await response.blob();
          const regionFile = new File([blob], 'region.png', { type: 'image/png' });
          
          // 前処理
          const processedRegionFile = await preprocessImage(regionFile);
          
          // OCR処理
          const result = await recognizeWithTesseract(processedRegionFile);
          
          // 学習したモデルでテキスト修正（ロードされている場合）
          const lines = await Promise.all(
            result.lines.map(async line => {
              if (modelLoaded) {
                const correctedText = await correctText(line.text);
                return {
                  ...line,
                  text: correctedText,
                  imageSrc: region.imageSrc
                };
              }
              return {
                ...line,
                imageSrc: region.imageSrc
              };
            })
          );
          
          return {
            ...result,
            lines
          };
        })
      );
      
      // 全領域の結果を統合
      const allLines = regionResults.flatMap(result => result.lines);
      
      // 信頼度は平均値
      const avgConfidence = regionResults.length > 0
        ? regionResults.reduce((sum, result) => sum + result.confidence, 0) / regionResults.length
        : 0;
      
      // 結果をセット
      setOcrResult({
        text: allLines.map(line => line.text).join('\n'),
        confidence: avgConfidence,
        lines: allLines
      });
      
      // 画像プレビューをセット
      setImagePreview(fullImageSrc);
    } catch (error) {
      console.error('OCR処理中にエラーが発生しました:', error);
      alert(error instanceof Error ? error.message : 'OCR処理中にエラーが発生しました。');
    } finally {
      setIsProcessing(false);
    }
  };

  // イベントハンドラ
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    processImage(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    const files = event.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    processImage(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAllText = () => {
    if (!ocrResult) return;
    navigator.clipboard.writeText(ocrResult.text);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleChangePage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      if (fileInputRef.current?.files && fileInputRef.current.files.length > 0) {
        const file = fileInputRef.current.files[0];
        if (file.type === 'application/pdf') {
          processImage(file);
        }
      }
    }
  };

  const toggleHandwrittenMode = () => {
    setIsHandwrittenMode(!isHandwrittenMode);
    if (fileInputRef.current?.files && fileInputRef.current.files.length > 0) {
      processImage(fileInputRef.current.files[0]);
    }
  };

  // テキスト編集の開始
  const startEditing = (index: number) => {
    if (!ocrResult) return;
    
    // 現在の編集状態を更新
    setIsEditing(prev => ({ ...prev, [index]: true }));
    
    // 初期テキストを設定
    setEditedText(prev => ({ 
      ...prev, 
      [index]: ocrResult.lines[index].text 
    }));
  };
  
  // テキスト編集の終了と学習データへの追加
  const saveEdit = (index: number) => {
    if (!ocrResult) return;
    
    const originalText = ocrResult.lines[index].text;
    const correctedText = editedText[index];
    
    // 修正がない場合は学習データに追加しない
    if (originalText === correctedText || !correctedText) {
      setIsEditing(prev => ({ ...prev, [index]: false }));
      return;
    }
    
    // 修正済みテキストを反映
    const updatedLines = [...ocrResult.lines];
    updatedLines[index] = {
      ...updatedLines[index],
      text: correctedText
    };
    
    // OCR結果を更新
    setOcrResult({
      ...ocrResult,
      lines: updatedLines,
      text: updatedLines.map(line => line.text).join('\n')
    });
    
    // 学習データに追加
    const newTrainingData: TrainingData = {
      imageSrc: ocrResult.lines[index].imageSrc || '',
      originalText,
      correctedText,
      bbox: ocrResult.lines[index].bbox
    };
    
    const updatedTrainingData = [...trainingData, newTrainingData];
    setTrainingData(updatedTrainingData);
    
    // localStorageに学習データを保存
    localStorage.setItem('ocrTrainingData', JSON.stringify(updatedTrainingData));
    
    // 編集モードを終了
    setIsEditing(prev => ({ ...prev, [index]: false }));
    
    console.log(`テキスト修正が保存されました: "${originalText}" → "${correctedText}"`);
  };
  
  // テキスト編集の取り消し
  const cancelEditing = (index: number) => {
    setIsEditing(prev => ({ ...prev, [index]: false }));
  };
  
  // テキスト入力の変更を処理
  const handleTextChange = (index: number, value: string) => {
    setEditedText(prev => ({ ...prev, [index]: value }));
  };

  return (
    <div className="flex flex-col space-y-6 w-full">
      {/* 画像アップロードエリア */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,application/pdf"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <div className="flex flex-col items-center justify-center space-y-2">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-medium">画像をドラッグ＆ドロップ、またはクリックして選択</p>
          <p className="text-sm text-gray-500">PNG, JPEG, GIF, PDF</p>
        </div>
      </div>

      {/* モード切替ボタン */}
      <div className="flex justify-center">
        <Button
          type="button"
          onClick={toggleHandwrittenMode}
          className={`rounded-md transition-colors ${isHandwrittenMode ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          {isHandwrittenMode ? '手書きモード (ON)' : '手書きモード (OFF)'}
        </Button>
      </div>

      {/* 学習データ情報 */}
      {trainingData.length > 0 && (
        <div className="flex justify-between items-center p-4 border rounded-lg bg-gray-50">
          <div>
            <h2 className="font-medium text-gray-700">学習データ: {trainingData.length}件</h2>
            <p className="text-sm text-gray-500">認識精度向上のために修正したテキストで学習できます</p>
          </div>
          <Button
            onClick={startTraining}
            disabled={isTraining}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {isTraining ? `学習中... ${trainProgress}%` : '学習を開始'}
          </Button>
        </div>
      )}

      {/* 画像プレビューとOCR結果 */}
      {(originalImagePreview || isProcessing) && (
        <div className="flex flex-col md:flex-row gap-6">
          {/* 元の画像 */}
          <div className="flex-1 border rounded-lg overflow-hidden">
            <h2 className="bg-gray-100 p-3 font-medium text-gray-700">元の画像</h2>
            <div className="p-4 flex justify-center">
              {originalImagePreview ? (
                <img 
                  src={originalImagePreview} 
                  alt="Original" 
                  className="max-w-full max-h-[500px] object-contain"
                  ref={originalImageRef}
                />
              ) : (
                <div className="h-[300px] w-full flex items-center justify-center">
                  <p className="text-gray-500">画像をアップロードしてください</p>
                </div>
              )}
            </div>
            
            {/* PDF用ページナビゲーション */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-3 p-3 border-t">
                <button 
                  onClick={() => handleChangePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-md bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  前へ
                </button>
                <span>{currentPage} / {totalPages}</span>
                <button 
                  onClick={() => handleChangePage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-md bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
          
          {/* OCR結果 */}
          <div className="flex-1 border rounded-lg overflow-hidden">
            <div className="bg-gray-100 p-3 flex justify-between items-center">
              <h2 className="font-medium text-gray-700">OCR結果</h2>
              {ocrResult && (
                <button
                  onClick={handleCopyAllText}
                  className="text-sm py-1 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  {copiedIndex === -1 ? 'コピーしました！' : '全てコピー'}
                </button>
              )}
            </div>
            
            <div className="p-4 min-h-[300px] max-h-[600px] overflow-y-auto">
              {isProcessing ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                  <p className="text-gray-600">OCR処理中...</p>
                </div>
              ) : ocrResult ? (
                <div className="space-y-8">
                  {ocrResult.lines.map((line, index) => (
                    <div key={index} className="group border rounded-lg overflow-hidden">
                      {/* 切り出し画像と対応するテキスト */}
                      <div className="flex flex-col">
                        {/* 切り出し画像 */}
                        {line.imageSrc && (
                          <div className="p-2 bg-gray-50 flex justify-center">
                            <img 
                              src={line.imageSrc} 
                              alt={`Text region ${index + 1}`} 
                              className="max-h-[150px] object-contain"
                            />
                          </div>
                        )}
                        
                        {/* OCR結果テキスト - 編集可能に修正 */}
                        <div className="relative bg-white p-4">
                          {isEditing[index] ? (
                            <div className="flex flex-col space-y-2">
                              <textarea
                                value={editedText[index] || ''}
                                onChange={(e) => handleTextChange(index, e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded text-lg"
                                rows={2}
                              />
                              <div className="flex justify-end space-x-2">
                                <button
                                  onClick={() => cancelEditing(index)}
                                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded"
                                >
                                  キャンセル
                                </button>
                                <button
                                  onClick={() => saveEdit(index)}
                                  className="px-3 py-1 bg-green-600 text-white rounded"
                                >
                                  保存して学習
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="relative">
                              <p className="break-words pr-14 text-lg font-medium">{line.text}</p>
                              <div className="absolute right-2 top-0 flex space-x-1">
                                <button
                                  onClick={() => handleCopyText(line.text, index)}
                                  className={`p-1.5 rounded ${
                                    copiedIndex === index ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 group-hover:bg-gray-300'
                                  } transition-colors`}
                                >
                                  {copiedIndex === index ? 'コピー済' : 'コピー'}
                                </button>
                                <button
                                  onClick={() => startEditing(index)}
                                  className="p-1.5 rounded bg-blue-600 text-white"
                                >
                                  修正
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 認識精度 */}
                  <div className="mt-8 text-sm text-gray-500 flex items-center gap-2">
                    <span>認識精度: {ocrResult.confidence.toFixed(2)}%</span>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          ocrResult.confidence >= 80 ? 'bg-green-500' : 
                          ocrResult.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, ocrResult.confidence)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500">OCR結果がここに表示されます</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 非表示のキャンバス要素 */}
      <canvas ref={canvasRef} className="hidden"></canvas>
      <img ref={imageRef} src={imagePreview || ''} className="hidden" alt="Processed" />

      {/* 学習進捗のモーダル */}
      {isTraining && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">学習中...</h2>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
              <div 
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${trainProgress}%` }}
              ></div>
            </div>
            <p className="text-gray-600 text-center">{trainProgress}% 完了</p>
          </div>
        </div>
      )}
    </div>
  );
}
