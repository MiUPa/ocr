"use client";

import Link from 'next/link';
import Image from 'next/image';

export function Header() {
  return (
    <header className="bg-white shadow">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image src="/logo.png" alt="User Local" width={32} height={32} />
              <span className="text-xl font-semibold">手書きOCR</span>
            </Link>
            <span className="text-gray-600">読み取りフォーマット一覧</span>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/qa" className="text-gray-600 hover:text-gray-900">
              Q&A
            </Link>
            <Link href="/contact" className="text-gray-600 hover:text-gray-900">
              お問い合わせ
            </Link>
            <button className="text-gray-600 hover:text-gray-900">
              ログアウト
            </button>
          </div>
        </div>
      </div>
    </header>
  );
} 