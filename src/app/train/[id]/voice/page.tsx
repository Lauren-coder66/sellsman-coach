'use client';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { VoiceTraining } from '@/components/voice-training';

function VoiceContent() {
  const { id } = useParams<{ id: string }>();
  return <VoiceTraining id={id} />;
}

export default function VoicePage() {
  return <Suspense fallback={<p className="p-6">正在读取训练…</p>}><VoiceContent /></Suspense>;
}
