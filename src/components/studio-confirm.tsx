'use client';

import { useId, useRef, useState } from 'react';

export function useStudioConfirm() {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<((value: boolean) => void) | null>(null);
  const titleId = useId();
  const [title, setTitle] = useState('');

  function ask(title: string) {
    if (pending.current || !dialog.current) return Promise.resolve(false);
    setTitle(title);
    dialog.current.returnValue = '';
    dialog.current.showModal();
    return new Promise<boolean>(resolve => { pending.current = resolve; });
  }

  const confirmation = <dialog ref={dialog} aria-labelledby={titleId} className="studio-sheet studio-dialog" onClose={event => {
    const resolve = pending.current;
    pending.current = null;
    resolve?.(event.currentTarget.returnValue === 'confirm');
  }}>
    <h2 id={titleId} className="text-xl font-bold leading-relaxed">{title}</h2>
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg border border-slate-400 px-5 hover:bg-slate-100">取消</button>
      <button type="button" onClick={() => dialog.current?.close('confirm')} className="min-h-11 rounded-lg bg-teal-700 px-5 font-bold text-white hover:bg-teal-800">确认</button>
    </div>
  </dialog>;

  return { ask, confirmation };
}
