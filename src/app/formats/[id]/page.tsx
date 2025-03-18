"use client";

import { useParams } from 'next/navigation';
import { OCRForm } from '@/components/OCRForm';

const formatTitles: { [key: string]: string } = {
  'application': '申込書',
  'daily-report': '日報',
  'receipt': '領収書',
};

export default function FormatPage() {
  const params = useParams();
  const formatId = params.id as string;
  const title = formatTitles[formatId] || 'フォーマット';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{title}の読み取り</h2>
      </div>
      <OCRForm />
    </div>
  );
} 