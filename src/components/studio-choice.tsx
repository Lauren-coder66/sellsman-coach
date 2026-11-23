'use client';

import { useId } from 'react';

type Option<T extends string> = { value: T; label: string; description?: string; disabled?: boolean };

export function StudioChoice<T extends string>({ label, value, options, onChange, className = '' }: {
  label: string; value: T; options: readonly (T | Option<T>)[]; onChange: (value: T) => void; className?: string;
}) {
  const name = useId();
  return <fieldset className={`min-w-0 ${className}`}>
    <legend className="mb-2 text-sm font-bold">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map(item => {
        const option = typeof item === 'string' ? { value: item, label: item } : item;
        return <label key={option.value} className="studio-choice">
          <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
          <span>{option.label}{option.description && <small>{option.description}</small>}</span>
        </label>;
      })}
    </div>
  </fieldset>;
}
