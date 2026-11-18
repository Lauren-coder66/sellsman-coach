'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { encodeWav } from '@/lib/voice/wav';

type Message = { id: string; role: string; content: string };
type Recording = { id: string; bytes: ArrayBuffer };
type Capture = { stream: MediaStream; context: AudioContext; player?: HTMLAudioElement; url?: string; request?: AbortController };

export function VoiceTraining({ id }: { id: string }) {
  const router = useRouter();
  const route = `/api/sessions/${id}`;
  const [enabled, setEnabled] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState('正在检查语音权限…');
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const capture = useRef<Capture | null>(null);
  const retry = useRef<Recording | null>(null);
  const pending = useRef(false);

  function disconnect() {
    const active = capture.current;
    capture.current = null;
    if (!active) return;
    active.request?.abort();
    active.stream.getTracks().forEach(track => track.stop());
    void active.context.close().catch(() => {});
    active.player?.pause();
    if (active.url) URL.revokeObjectURL(active.url);
  }
  useEffect(() => disconnect, []);
  useEffect(() => {
    let live = true;
    Promise.all([api<{ enabled: boolean }>(route + '/voice'), api<{ messages: Message[] }>(route)])
      .then(([access, conversation]) => {
        if (!live) return;
        setEnabled(access.enabled);
        setMessages(conversation.messages);
        setStatus(access.enabled ? '启用麦克风后，说完停顿片刻即可提交。' : '当前账号未开通语音训练。你可以继续使用文字模式。');
      }).catch(() => { if (live) setStatus('无法读取训练或语音权限。'); });
    return () => { live = false; };
  }, [route]);

  async function reload() {
    setMessages((await api<{ messages: Message[] }>(route)).messages);
  }

  async function submit(record: Recording) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setCanRetry(false);
    retry.current = record;
    setStatus('正在识别并生成回复…');
    const controller = new AbortController();
    const active = capture.current;
    if (active) active.request = controller;
    try {
      const response = await fetch(route + '/voice', {
        method: 'POST', headers: { 'Content-Type': 'audio/wav', 'x-request-id': record.id }, body: record.bytes,
        signal: controller.signal,
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw Error(json?.error?.message ?? '语音请求失败');
      }
      retry.current = null;
      await reload();
      if (response.status === 204 || !active || capture.current !== active) {
        setStatus('对话已恢复，可以继续练习。');
        return;
      }
      const blob = await response.blob();
      if (capture.current !== active) return;
      const url = URL.createObjectURL(blob);
      if (active.url) URL.revokeObjectURL(active.url);
      active.url = url;
      active.player = new Audio(url);
      active.player.onended = () => setStatus('继续说话即可进入下一轮。');
      await active.player.play();
      setStatus('客户正在说话，开口即可打断播放。');
    } catch (error) {
      try { await reload(); } catch { /* Keep existing transcript visible when offline. */ }
      setCanRetry(Boolean(retry.current));
      setStatus(controller.signal.aborted ? '已暂停。恢复后可重试同一次录音。'
        : error instanceof Error ? error.message : '网络连接异常，请重试。');
    } finally { pending.current = false; setBusy(false); }
  }

  async function start() {
    if (!enabled || capture.current || busy) return;
    setBusy(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext({ sampleRate: 16000 });
      const active = { context, stream } as Capture;
      capture.current = active;
      if (context.sampleRate !== 16000) throw Error('浏览器不支持 16 kHz 采集，请使用文字模式。');
      await context.audioWorklet.addModule('/voice-capture.js');
      const node = new AudioWorkletNode(context, 'sales-voice-capture');
      context.createMediaStreamSource(stream).connect(node);
      const mute = context.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(context.destination);
      let frames: Float32Array[] = [];
      let samples = 0;
      let quiet = 0;
      let voiced = 0;
      let greeting: Float32Array[] = [];
      node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
        if (capture.current !== active || pending.current) return;
        const volume = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
        const audible = volume >= 0.025;
        voiced = audible ? voiced + 1 : 0;
        if (!frames.length && voiced < 5) {
          greeting.push(data);
          if (greeting.length > 18) greeting.shift();
          return;
        }
        if (!frames.length) {
          active.player?.pause();
          frames = greeting;
          greeting = [];
          samples = frames.reduce((sum, frame) => sum + frame.length, 0);
          quiet = 0;
        }
        frames.push(data);
        samples += data.length;
        quiet = audible ? 0 : quiet + data.length;
        if (quiet < 10400 && samples < 235000) return;
        const joined = new Float32Array(samples);
        let offset = 0;
        for (const frame of frames) { joined.set(frame, offset); offset += frame.length; }
        frames = []; samples = 0; quiet = 0; voiced = 0;
        void submit({ id: crypto.randomUUID(), bytes: encodeWav(joined) });
      };
      await context.resume();
      setRunning(true);
      setStatus('可以开始说话。');
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      disconnect();
      setStatus(error instanceof DOMException && error.name === 'NotAllowedError' ? '麦克风权限被拒绝。可以继续文字训练。'
        : error instanceof Error ? error.message : '无法启动麦克风。');
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-3xl space-y-5 p-5">
    <Link className="text-teal-700" href={`/train/${id}`}>返回文字训练</Link>
    <h1 className="text-3xl font-bold">语音训练</h1>
    <p>录音仅用于识别，不保存音频文件。对话转写保存在本次训练。</p>
    <p role="status">{status}</p>
    <div className="flex flex-wrap gap-3">
      <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={!enabled || (!running && busy)} onClick={() => {
        if (!running) { void start(); return; }
        disconnect(); setRunning(false); setStatus('已暂停');
      }}>{running ? '暂停麦克风' : '启用或继续麦克风'}</button>
      {canRetry && <button className="rounded border px-3 py-2" disabled={busy} onClick={() => { if (retry.current) void submit(retry.current); }}>重试同一次录音</button>}
      <button className="rounded border px-3 py-2" disabled={!enabled || busy} onClick={async () => {
        disconnect(); setRunning(false); setBusy(true);
        try { await api(route + '/finish', { method: 'POST' }); router.push(`/report/${id}`); }
        catch (error) { setStatus(error instanceof Error ? error.message : '暂时无法结束训练。'); }
        finally { setBusy(false); }
      }}>结束并查看报告</button>
    </div>
    <section aria-label="语音转写" className="space-y-2">
      {messages.map(message => <p key={message.id} className="rounded bg-slate-100 p-3"><b>{message.role === 'user' ? '销售' : '客户'}：</b>{message.content}</p>)}
    </section>
  </main>;
}
