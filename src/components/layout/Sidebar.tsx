"use client";

import Link from 'next/link';

export function Sidebar() {
  return (
    <aside className="w-64 bg-white shadow-sm h-full">
      <nav className="p-4">
        <ul className="space-y-2">
          <li>
            <Link
              href="/forms/application"
              className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md"
            >
              申請書
            </Link>
          </li>
          <li>
            <Link
              href="/forms/report"
              className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md"
            >
              日報
            </Link>
          </li>
          <li>
            <Link
              href="/forms/receipt"
              className="block px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-md"
            >
              領収書
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
} 