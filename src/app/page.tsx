import { OCRForm } from '../components/OCRForm';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold text-center mb-8">手書きOCR</h1>
        <OCRForm />
      </div>
    </main>
  );
}
