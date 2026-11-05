'use client';

import { useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import { PipeTable } from '@/components/ui/PipeTable';
import { SeriesVideoField } from '@/features/products/SeriesVideoField';
import { PRODUCT_CATEGORIES, PRODUCT_PHOTO_LABELS, PRODUCT_STATUSES } from '@/lib/constants';
import {
  getProductFields,
  isGarment,
  normalizeSeriesTerm,
  type ProductField,
} from '@/lib/product-schema';
import { deleteSeriesVideo } from '@/lib/storage/series-videos';
import type { Product, ProductCategory } from '@/lib/types';
import { newId } from '@/lib/utils/id';

type FormValues = Record<string, string | string[]>;

function initialValues(category: ProductCategory, product?: Product): FormValues {
  const values: FormValues = {};
  getProductFields(category).forEach((field) => {
    if (field.key === 'memberIds') {
      values[field.key] = product?.memberIds ?? [];
    } else if (field.key === 'status' && !product) {
      values[field.key] = 'Tersedia';
    } else if (field.key === 'collar' || field.key === 'placket') {
      // Legacy wording maps onto the official option so the select preselects correctly.
      values[field.key] = normalizeSeriesTerm(String(product?.[field.key] ?? ''));
    } else {
      values[field.key] = product ? String(product[field.key] ?? '') : '';
    }
  });
  return values;
}

function formTitle(category: ProductCategory, editing: boolean): string {
  const noun =
    category === 'Product Series'
      ? 'Seri'
      : category === 'Fabric Collection'
        ? 'Bahan'
        : category === 'Size Chart'
          ? 'Size Chart'
          : 'Produk';
  return `${editing ? 'Edit' : 'Tambah'} ${noun}`;
}

interface ProductFormProps {
  current?: Product;
  initialCategory: ProductCategory;
  onSaved: (item: Product) => void;
  onClose: () => void;
}

export function ProductForm({
  current,
  initialCategory,
  onSaved,
  onClose,
}: ProductFormProps) {
  const { snapshot, upsertContent } = useData();
  const { showToast } = useToast();
  const [category, setCategory] = useState<ProductCategory>(current?.category ?? initialCategory);
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(current?.category ?? initialCategory, current),
  );
  const [image, setImage] = useState(current?.image ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const fields = getProductFields(category);
  const sections = [...new Set(fields.map((field) => field.section))];

  const setValue = (key: string, value: string | string[]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const changeCategory = (nextCategory: ProductCategory) => {
    setCategory(nextCategory);
    setValues(initialValues(nextCategory, current));
    setErrors({});
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && !String(values[field.key] ?? '').trim()) {
        nextErrors[field.key] = `${field.label} wajib diisi`;
      }
    });
    const price = String(values.price ?? '').trim();
    if (price && Number(price) < 0) nextErrors.price = 'Harga tidak boleh negatif';
    const photo = image.trim();
    if (photo && !/^https?:\/\//i.test(photo)) {
      nextErrors.image = 'URL foto harus diawali http:// atau https://';
    }
    const video = String(values.videoUrl ?? '').trim();
    if (video && !/^https?:\/\//i.test(video)) {
      nextErrors.videoUrl = 'URL video tidak valid';
    }
    const code = String(values.code ?? '').trim();
    if (code) {
      const duplicate = snapshot.content.products.find(
        (product) =>
          product.id !== current?.id &&
          product.category === category &&
          product.code.toLowerCase() === code.toLowerCase(),
      );
      if (duplicate) nextErrors.code = `Kode sudah dipakai oleh "${duplicate.name}"`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast('Periksa kembali kolom yang wajib diisi', 'err');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    const text = (key: string) => String(values[key] ?? '').trim();
    const item: Product = {
      id: current?.id ?? newId('p'),
      category,
      name: text('name'),
      code: text('code'),
      series: text('series'),
      status: text('status'),
      description: text('description'),
      fabric: text('fabric'),
      colors: text('colors'),
      sizes: text('sizes'),
      price: text('price'),
      advantages: text('advantages'),
      extra: text('extra'),
      composition: text('composition'),
      gsm: text('gsm'),
      characteristics: text('characteristics'),
      table: text('table'),
      measurement: text('measurement'),
      guide: text('guide'),
      collar: text('collar'),
      placket: text('placket'),
      customerPitch: text('customerPitch'),
      memberIds: Array.isArray(values.memberIds) ? values.memberIds : [],
      videoUrl: text('videoUrl'),
      image: image.trim(),
      sample: false,
      updatedAt: Date.now(),
    };

    try {
      await upsertContent('products', item);
      // Video diganti atau dihapus: file lama di storage ikut dibersihkan (link YouTube diabaikan).
      if (current?.videoUrl && current.videoUrl !== item.videoUrl) {
        deleteSeriesVideo(current.videoUrl).catch(() => undefined);
      }
      showToast(current ? 'Perubahan berhasil disimpan' : 'Data berhasil ditambahkan');
      onSaved(item);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Gagal menyimpan data', 'err');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: ProductField) => {
    const id = `pf_${field.key}`;
    const value = values[field.key];
    const common = {
      id,
      className: 'inp',
      value: Array.isArray(value) ? value.join(', ') : value,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setValue(field.key, event.target.value),
    };

    if (field.type === 'textarea') {
      return (
        <textarea
          {...common}
          rows={field.key === 'advantages' ? 4 : 3}
          placeholder={field.placeholder}
        />
      );
    }

    if (field.type === 'select') {
      return (
        <select {...common}>
          {(field.options ?? PRODUCT_STATUSES).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === 'number') {
      return <input {...common} type="number" min="0" placeholder={field.placeholder} />;
    }

    if (field.type === 'series') {
      return (
        <>
          <input
            {...common}
            list="dl_series"
            placeholder="Pilih atau ketik nama seri"
          />
          <datalist id="dl_series">
            {snapshot.content.products
              .filter((product) => product.category === 'Product Series')
              .map((product) => (
                <option key={product.id} value={product.name} />
              ))}
          </datalist>
        </>
      );
    }

    if (field.type === 'fabric') {
      return (
        <>
          <input {...common} list="dl_fabric" placeholder="Kode bahan, contoh: B-01" />
          <datalist id="dl_fabric">
            {snapshot.content.products
              .filter((product) => product.category === 'Fabric Collection')
              .map((product) => (
                <option key={product.id} value={product.code}>
                  {product.name}
                </option>
              ))}
          </datalist>
        </>
      );
    }

    if (field.type === 'video') {
      return (
        <SeriesVideoField
          value={String(value ?? '')}
          onChange={(url) => setValue(field.key, url)}
        />
      );
    }

    if (field.type === 'table') {
      return (
        <>
          <textarea
            className="inp mono-input"
            id={id}
            rows={6}
            value={String(value ?? '')}
            onChange={(event) => setValue(field.key, event.target.value)}
          />
          <div className="sm muted mt1">Preview:</div>
          <div className="mt1">
            <PipeTable value={String(value ?? '')} />
          </div>
        </>
      );
    }

    if (field.type === 'members') {
      const selected = Array.isArray(value) ? value : [];
      const garments = snapshot.content.products.filter(
        (product) => isGarment(product.category) && product.id !== current?.id,
      );
      if (!garments.length) return <p className="sm muted">Belum ada produk Thobe/Gamis/Koko.</p>;
      return (
        <div className="members-grid" id={id}>
          {garments.map((product) => (
            <label className="row sm" style={{ gap: 6 }} key={product.id}>
              <input
                type="checkbox"
                value={product.id}
                checked={selected.includes(product.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, product.id]
                    : selected.filter((entry) => entry !== product.id);
                  setValue('memberIds', next);
                }}
              />
              {product.name} <span className="muted">{product.code}</span>
            </label>
          ))}
        </div>
      );
    }

    return <input {...common} placeholder={field.placeholder} />;
  };

  return (
    <div>
      <div className="row sp" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>{formTitle(category, Boolean(current))}</h2>
          <p className="sm muted">
            {current
              ? 'Perbarui informasi lalu simpan.'
              : 'Kolom bertanda * wajib diisi.'}
          </p>
        </div>
        <button className="icb" type="button" onClick={onClose} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>

      <div className="mt">
        <label className="flab" htmlFor="pf_cat">
          Kategori <span style={{ color: 'var(--red)' }}>*</span>
        </label>
        <select
          className="inp"
          id="pf_cat"
          value={category}
          disabled={Boolean(current)}
          onChange={(event) => changeCategory(event.target.value as ProductCategory)}
        >
          {PRODUCT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="sm muted" style={{ marginTop: 3 }}>
          {current
            ? 'Kategori tidak dapat diubah setelah data dibuat.'
            : 'Kolom form menyesuaikan kategori yang dipilih.'}
        </div>
      </div>

      {sections.map((section) => (
        <div key={section}>
          <div className="fsec">{section}</div>
          <div className="grid g2" style={{ gap: 14, marginTop: 14 }}>
            {fields
              .filter((field) => field.section === section)
              .map((field) => (
                <div
                  key={String(field.key)}
                  style={{ gridColumn: field.full ? '1/-1' : undefined }}
                >
                  <label className="flab" htmlFor={`pf_${field.key}`}>
                    {field.label}
                    {field.required ? <span style={{ color: 'var(--red)' }}> *</span> : null}
                  </label>
                  {renderField(field)}
                  {field.hint ? (
                    <div className="sm muted" style={{ marginTop: 3 }}>
                      {field.hint}
                    </div>
                  ) : null}
                  {errors[String(field.key)] ? (
                    <div className="sm" style={{ color: 'var(--red)', marginTop: 3 }}>
                      {errors[String(field.key)]}
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="fsec">Media</div>
      <label className="flab" htmlFor="pf_image" style={{ marginTop: 12 }}>
        {PRODUCT_PHOTO_LABELS[category] ?? 'Foto Produk'}
      </label>
      <input
        className="inp"
        id="pf_image"
        value={image}
        placeholder="https://res.cloudinary.com/…/foto.webp"
        onChange={(event) => {
          setImage(event.target.value);
          setErrors((previous) => {
            if (!previous.image) return previous;
            const next = { ...previous };
            delete next.image;
            return next;
          });
        }}
      />
      <div className="sm muted" style={{ marginTop: 3 }}>
        Tempel URL gambar dari Cloudinary. Kosongkan jika belum ada foto.
      </div>
      {errors.image ? (
        <div className="sm" style={{ color: 'var(--red)', marginTop: 3 }}>
          {errors.image}
        </div>
      ) : null}
      {image.trim() ? (
        <img
          src={image.trim()}
          alt="Preview"
          className="upload-preview"
          style={{ marginTop: 12 }}
        />
      ) : null}

      <div className="mfoot">
        <button className="btn" type="button" onClick={onClose}>
          Batal
        </button>
        <button className="btn p" type="button" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" />
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}
