'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from './Icon';

export type RecordFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'lines'
  | 'chat'
  | 'number'
  | 'check'
  | 'multi'
  | 'tags'
  | 'list';

export interface RecordFieldOption {
  value: string;
  label: string;
}

export interface RecordField {
  key: string;
  label: string;
  type?: RecordFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  rows?: number;
  full?: boolean;
  section?: string;
  options?: readonly (string | RecordFieldOption)[];
  min?: number;
  max?: number;
}

export type RecordValue = string | boolean | string[] | number;
export type RecordValues = Record<string, RecordValue>;

interface RecordFormProps {
  title: string;
  subtitle?: string;
  fields: RecordField[];
  initial: object;
  defaults?: object;
  submitLabel?: string;
  onSubmit: (values: RecordValues) => Promise<void> | void;
  onCancel: () => void;
  renderExtra?: (
    values: RecordValues,
    setValue: (key: string, value: RecordValue) => void,
  ) => ReactNode;
  validate?: (values: RecordValues) => string | null;
}

function optionOf(option: string | RecordFieldOption): RecordFieldOption {
  return typeof option === 'string' ? { value: option, label: option } : option;
}

function toFormValue(field: RecordField, raw: unknown): RecordValue {
  if (field.type === 'multi' || field.type === 'list') {
    return Array.isArray(raw) ? raw.map(String) : [];
  }
  if (field.type === 'check') return Boolean(raw);
  if (field.type === 'lines' || field.type === 'chat') {
    return Array.isArray(raw) ? raw.join('\n') : String(raw ?? '');
  }
  if (field.type === 'tags') {
    return Array.isArray(raw) ? raw.join(', ') : String(raw ?? '');
  }
  if (field.type === 'number') return raw == null ? '' : String(raw);
  return String(raw ?? '');
}

function toOutputValue(field: RecordField, value: RecordValue): RecordValue {
  if (field.type === 'multi') return Array.isArray(value) ? value : [];
  if (field.type === 'list') {
    return Array.isArray(value)
      ? value.map((entry) => entry.trim()).filter(Boolean)
      : [];
  }
  if (field.type === 'check') return Boolean(value);
  if (field.type === 'lines' || field.type === 'chat') {
    return String(value)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (field.type === 'tags') {
    return String(value)
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean);
  }
  if (field.type === 'number') {
    const text = String(value).trim();
    return text === '' ? 0 : Number(text);
  }
  return String(value).trim();
}

export function RecordForm({
  title,
  subtitle,
  fields,
  initial,
  defaults,
  submitLabel = 'Simpan',
  onSubmit,
  onCancel,
  renderExtra,
  validate,
}: RecordFormProps) {
  const { showToast } = useToast();
  const [values, setValues] = useState<RecordValues>(() => {
    const initialValues = initial as Record<string, unknown>;
    const defaultsValues = defaults as Record<string, unknown> | undefined;
    const result: RecordValues = {};
    fields.forEach((field) => {
      const raw = initialValues[field.key] ?? defaultsValues?.[field.key];
      result[field.key] = toFormValue(field, raw);
    });
    return result;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const setValue = (key: string, value: RecordValue) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const sections = useMemo(() => {
    const result: { name: string; fields: RecordField[] }[] = [];
    fields.forEach((field) => {
      const name = field.section || '';
      const existing = result.find((section) => section.name === name);
      if (existing) existing.fields.push(field);
      else result.push({ name, fields: [field] });
    });
    return result;
  }, [fields]);

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      const value = values[field.key];
      const isEmpty =
        (typeof value === 'string' && !value.trim()) ||
        (Array.isArray(value) && value.length === 0);
      if (field.required && isEmpty) {
        nextErrors[field.key] = `${field.label} wajib diisi`;
        return;
      }
      if (field.type === 'number' && String(value).trim() !== '') {
        const numeric = Number(value);
        if (field.min != null && numeric < field.min) {
          nextErrors[field.key] = `${field.label} minimal ${field.min}`;
        }
        if (field.max != null && numeric > field.max) {
          nextErrors[field.key] = `${field.label} maksimal ${field.max}`;
        }
      }
    });
    const customError = validate?.(values) ?? null;
    if (customError) nextErrors.__form = customError;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast(customError || 'Periksa kembali kolom yang wajib diisi', 'err');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!validateForm()) return;
    const result: RecordValues = {};
    fields.forEach((field) => {
      result[field.key] = toOutputValue(field, values[field.key]);
    });
    setSaving(true);
    try {
      await onSubmit(result);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Gagal menyimpan data', 'err');
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (field: RecordField, index: number) => {
    const id = `rf_${field.key}`;
    const value = values[field.key];
    const type = field.type ?? 'text';

    if (type === 'select') {
      const options = (field.options ?? []).map(optionOf);
      return (
        <select
          id={id}
          className="inp"
          value={String(value)}
          onChange={(event) => setValue(field.key, event.target.value)}
          autoFocus={index === 0}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (type === 'textarea' || type === 'lines' || type === 'chat') {
      return (
        <textarea
          id={id}
          className="inp"
          rows={field.rows ?? (type === 'chat' ? 4 : 3)}
          placeholder={field.placeholder}
          value={String(value)}
          onChange={(event) => setValue(field.key, event.target.value)}
          autoFocus={index === 0}
        />
      );
    }

    if (type === 'check') {
      return (
        <label className="row sm" style={{ gap: 8, fontWeight: 600, cursor: 'pointer' }}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setValue(field.key, event.target.checked)}
          />
          {field.placeholder || field.label}
        </label>
      );
    }

    if (type === 'list') {
      const rows = Array.isArray(value) ? value : [];
      const update = (next: string[]) => setValue(field.key, next);
      const move = (from: number, to: number) => {
        if (to < 0 || to >= rows.length) return;
        const next = [...rows];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        update(next);
      };
      return (
        <div className="listfield" id={id}>
          {rows.map((row, rowIndex) => (
            <div className="listfield-row" key={rowIndex}>
              <span className="listfield-no">{rowIndex + 1}</span>
              <input
                className="inp"
                value={row}
                placeholder={`${field.label} ${rowIndex + 1}`}
                aria-label={`${field.label} ${rowIndex + 1}`}
                onChange={(event) => {
                  const next = event.target.value;
                  update(rows.map((entry, position) => (position === rowIndex ? next : entry)));
                }}
              />
              <button
                type="button"
                className="icb"
                aria-label="Naikkan urutan"
                disabled={rowIndex === 0}
                onClick={() => move(rowIndex, rowIndex - 1)}
              >
                <Icon name="arrow-up" />
              </button>
              <button
                type="button"
                className="icb"
                aria-label="Turunkan urutan"
                disabled={rowIndex === rows.length - 1}
                onClick={() => move(rowIndex, rowIndex + 1)}
              >
                <Icon name="arrow-down" />
              </button>
              <button
                type="button"
                className="icb"
                aria-label="Hapus baris"
                onClick={() => update(rows.filter((_, position) => position !== rowIndex))}
              >
                <Icon name="trash-2" />
              </button>
            </div>
          ))}
          <button type="button" className="btn sm" onClick={() => update([...rows, ''])}>
            <Icon name="plus" />
            Tambah baris
          </button>
        </div>
      );
    }

    if (type === 'multi') {
      const selected = Array.isArray(value) ? value : [];
      const options = (field.options ?? []).map(optionOf);
      return (
        <div className="members-grid" id={id}>
          {options.map((option) => (
            <label className="row sm" style={{ gap: 6 }} key={option.value}>
              <input
                type="checkbox"
                value={option.value}
                checked={selected.includes(option.value)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((entry) => entry !== option.value);
                  setValue(field.key, next);
                }}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    return (
      <input
        id={id}
        className="inp"
        type={type === 'number' ? 'number' : 'text'}
        min={type === 'number' ? field.min : undefined}
        max={type === 'number' ? field.max : undefined}
        placeholder={field.placeholder}
        value={String(value)}
        onChange={(event) => setValue(field.key, event.target.value)}
        autoFocus={index === 0}
      />
    );
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="row sp" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="sm muted">{subtitle}</p> : null}
        </div>
        <button className="icb" type="button" onClick={onCancel} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>

      {sections.map((section) => (
        <div key={section.name || 'main'}>
          {section.name ? <div className="fsec">{section.name}</div> : null}
          <div className={`grid g2${section.name ? '' : ' mt'}`} style={{ gap: 14 }}>
            {section.fields.map((field, index) => (
              <div
                key={field.key}
                style={{ gridColumn: field.full ? '1/-1' : undefined }}
              >
                {field.type !== 'check' ? (
                  <label className="sm" htmlFor={`rf_${field.key}`} style={labelStyle}>
                    {field.label}
                    {field.required ? <span style={{ color: 'var(--red)' }}> *</span> : null}
                  </label>
                ) : null}
                {renderInput(field, field.key === fields[0]?.key ? 0 : -1)}
                {field.hint ? (
                  <div className="sm muted" style={{ marginTop: 3 }}>
                    {field.hint}
                  </div>
                ) : null}
                {errors[field.key] ? (
                  <div className="sm" style={{ color: 'var(--red)', marginTop: 3 }}>
                    {errors[field.key]}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}

      {errors.__form ? (
        <div className="note rd mt">
          <Icon name="shield-alert" />
          <div>{errors.__form}</div>
        </div>
      ) : null}

      {renderExtra?.(values, setValue)}

      <div className="mfoot">
        <button className="btn" type="button" onClick={onCancel}>
          Batal
        </button>
        <button className="btn p" type="submit" disabled={saving}>
          <Icon name="check" />
          {saving ? 'Menyimpan…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

const labelStyle = {
  display: 'block',
  fontWeight: 500,
  marginBottom: 5,
} as const;
